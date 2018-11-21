import GameSocket from './gamesocket';
import { Resoluble, Entity, Vector } from 'turn-based-combat-framework';
import Stage from '../sync/stage';
import ResolubleManager from './resolublemanager';
import Log from './log';
import RoomState from '../states/roomstate';
import SocketState from '../states/socketstate';

export default class GameRoom {
    private stage: Stage;
    private state: RoomState;
    private deployment_timeout: number = 999;
    private deployment_max: number = 4;

    private get connections(): Array<GameSocket> {
        return [this.p1, this.p2];
    }

    public get alive(): boolean {
        if (this.state === RoomState.DEAD) return false;

        return true;
    }

    constructor(readonly key: string, private readonly p1: GameSocket, private readonly p2: GameSocket) {
        this.stage = new Stage(7, 7, 1);
        this.state = RoomState.CREATED;

        for (const connection of this.connections) {
            connection.socket.on('deployment-ready', () => {
                if (connection.state !== SocketState.MATCHED) return;
                connection.state = SocketState.DEPLOYMENT;
            });

            connection.socket.on('battle-ready', (deployment_payload: any) => {
                if (connection.state !== SocketState.DEPLOYMENT) return;
                connection.state = SocketState.BATTLE;
                connection.units = deployment_payload.entities;
            });

            connection.socket.on('resoluble', (resoluble_payload: any) => {
                if (connection.state !== SocketState.BATTLE) return;

                this.stage.battle.deserialize_resoluble(resoluble_payload.resoluble);
            });

            connection.state = SocketState.MATCHED;
        }

        this.begin_match();
    }

    public update(dt: number): void {
        switch (this.state) {
            case RoomState.CREATED:
                if (this.p1.state === SocketState.DEPLOYMENT && this.p1.state === SocketState.DEPLOYMENT) {
                    this.state = RoomState.DEPLOYMENT;

                    for (const connection of this.connections) {
                        const deployment_axes: Array<number> = new Array<number>();
                        if (connection.team === 0) {
                            deployment_axes.push(0, 1);
                        } else {
                            deployment_axes.push(this.stage.width - 1, this.stage.width - 2);
                        }

                        const deployment_tiles: Array<Vector> = new Array<Vector>();
                        for (let i: number = 0; i < this.stage.height; i++) {
                            for (const axis of deployment_axes) {
                                deployment_tiles.push(new Vector(axis, i, 0));
                            }
                        }
                        
                        connection.tiles = deployment_tiles;
                        connection.socket.emit('deployment-started', {
                            deployment_max: this.deployment_max,
                            deployment_tiles: connection.tiles
                        });
                    }
                }
                break;

            case RoomState.DEPLOYMENT:
                this.deployment_timeout -= dt;

                if ((this.p1.state === SocketState.BATTLE && this.p2.state === SocketState.BATTLE)) {
                    this.state = RoomState.BATTLE;

                    for (const connection of this.connections) {
                        let index: number = 1;
                        for (const unit of connection.units) {                            
                            if (!Stage.local_within_specific(unit[1], connection.tiles)) continue;
                            if (index > this.deployment_max) continue;

                            const entity: Entity = new Entity();
                            entity.identifier.class_key = unit[0];
                            entity.combat.alive = true;
                            entity.combat.current_health = 1;
                            entity.spatial = {
                                position: new Vector(unit[1].x, unit[1].y, unit[1].z),
                                facing: connection.team === 0 ? new Vector(1, -1, 0) : new Vector(-1, 1, 0),
                                has_moved: false
                            };
    
                            this.stage.battle.add_entity(entity, connection.team);

                            index++;
                        }
                    }  

                    const serialized_stage: any = JSON.stringify(this.stage);
                    for (const connection of this.connections) {
                        connection.socket.emit('battle-started', {
                            stage: serialized_stage
                        });
                    }
                }

                break;

            case RoomState.BATTLE:
                this.stage.battle.update(dt);

                if (this.stage.battle.get_team_wiped()) {
                    Log.info(this.key + ' match ended successfully. Team ' + this.stage.battle.get_team_defeated() + ' defeated.');
                    this.close();
                }

                break;
        }
    }

    public close(): void {
        for (const connection of this.connections) {
            if (connection.alive) {
                connection.room = null;
                connection.units = null;
                connection.tiles = null;
                connection.socket.removeAllListeners();

                connection.state = SocketState.CREATED;
                connection.socket.emit('room-closed');
            }
        }

        this.state = RoomState.DEAD;
        Log.info(this.key + ' closed.');
    }

    private on_pre_tick(): void {
        for (const entity of this.stage.entities) {
            this.stage.battle.call_resoluble('Attack', true, entity);
        }

        const delayed_resolubles: Array<Resoluble> = this.stage.battle.get_delayed_resolubles();

        ResolubleManager.prepare_resolubles(delayed_resolubles);
        ResolubleManager.validate_moves(this.stage, delayed_resolubles.filter(resoluble => resoluble.active));
    }

    private on_post_tick(): void {
        for (const connection of this.connections) {
            connection.socket.emit('post-tick', {
                turn: this.stage.battle.serialize_turn()
            });
        }
    }

    private begin_match(): void {
        const serialized_stage: any = JSON.stringify(this.stage);

        let index: number = 0;
        for (const connection of this.connections) {
            connection.team = index;
            connection.room = this;

            connection.socket.emit('matched', {
                team: connection.team,
                stage: serialized_stage
            })

            index++;
        }

        this.stage.battle.register_pre_tick_callback(this.on_pre_tick, this);
        this.stage.battle.register_post_tick_callback(this.on_post_tick, this);
    }
}