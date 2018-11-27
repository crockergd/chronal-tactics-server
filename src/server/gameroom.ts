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

    public get interval(): number {
        const living_entity_count: number = this.stage.entities.filter(entity => entity.alive).length;
        return 1.4 + (0.2 * living_entity_count);
    }

    constructor(readonly key: string, private readonly p1: GameSocket, private readonly p2: GameSocket) {
        this.stage = new Stage(7, 7, 1);
        this.state = RoomState.CREATED;

        for (const connection of this.connections) {
            connection.socket.on('deployment-ready', () => {
                if (connection.state !== SocketState.MATCHED) return;
                // Log.info('deployment-ready received from ' + connection.key + '.');
                connection.state = SocketState.DEPLOYMENT;
            });

            connection.socket.on('battle-ready', (deployment_payload: any) => {
                if (connection.state !== SocketState.DEPLOYMENT) return;
                connection.state = SocketState.BATTLE;
                connection.units = deployment_payload.entities;

                for (const deployment_connection of this.connections) {
                    // Log.info('player-ready emitted to ' + deployment_connection.key + '.');
                    deployment_connection.socket.emit('player-readied', {
                        players_ready: this.connections.filter(connection => connection.state === SocketState.BATTLE).length
                    });
                }
            });

            connection.socket.on('resoluble', (resoluble_payload: any) => {
                if (connection.state !== SocketState.BATTLE) return;

                this.stage.battle.deserialize_resoluble(resoluble_payload.resoluble);
            });

            connection.state = SocketState.MATCHED;
        }

        const serialized_stage: any = JSON.stringify(this.stage);

        this.p1.team = 0;
        this.p2.team = 1;

        this.p1.room = this;
        this.p2.room = this;

        this.p1.socket.emit('matched', {
            team: this.p1.team,
            stage: serialized_stage,
            opponent: this.p2.settings.name
        });

        this.p2.socket.emit('matched', {
            team: this.p2.team,
            stage: serialized_stage,
            opponent: this.p1.settings.name
        });

        this.stage.battle.register_pre_tick_callback(this.on_pre_tick, this);
        this.stage.battle.register_post_tick_callback(this.on_post_tick, this);
    }

    public update(dt: number): void {
        switch (this.state) {
            case RoomState.CREATED:
                if (this.p1.state === SocketState.DEPLOYMENT && this.p2.state === SocketState.DEPLOYMENT) {
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
                            stage: serialized_stage,
                            interval: this.interval
                        });
                    }
                }

                break;

            case RoomState.BATTLE:
                this.stage.battle.update(dt);
                this.stage.battle.set_async_interval(this.interval);

                if (this.stage.battle.get_team_wiped()) {
                    const teams_defeated: Array<number> = this.stage.battle.get_teams_defeated();
                    let winning_team: number = -1;

                    if (teams_defeated.filter(team => team === this.p1.team).length && !teams_defeated.filter(team => team === this.p2.team).length) {
                        winning_team = this.p2.team;
                    } else if (!teams_defeated.filter(team => team === this.p1.team).length && teams_defeated.filter(team => team === this.p2.team).length) {
                        winning_team = this.p1.team;
                    }

                    for (const connection of this.connections) {
                        connection.socket.emit('battle-completed', {
                            winning_team: winning_team
                        });
                    }

                    Log.info(this.key + ' match ended successfully.');
                    this.close_soft();
                }

                break;
        }
    }

    /**
     * Close the room gracefully after match completion
     */
    public close_soft(): void {
        for (const connection of this.connections) {
            if (connection.alive) {
                connection.room = null;
                connection.units = null;
                connection.tiles = null;
                connection.socket.removeAllListeners();

                connection.state = SocketState.CREATED;
            }
        }

        this.state = RoomState.DEAD;
    }

    /**
     * Close the room forcefully after a disconnection or failure, disconnecting all remaining clients
     */
    public close_hard(): void {
        this.close_soft();

        for (const connection of this.connections) {
            if (connection.alive) {
                connection.socket.emit('room-closed');
            }
        }

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
                turn: this.stage.battle.serialize_turn(),
                interval: this.stage.battle.get_async_interval()
            });
        }
    }
}