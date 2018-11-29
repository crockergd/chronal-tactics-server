import GameSocket from './gamesocket';
import { Resoluble, Entity, Vector } from 'turn-based-combat-framework';
import Stage from '../sync/stage';
import ResolubleManager from './resolublemanager';
import Log from './log';
import RoomState from '../states/roomstate';
import SocketState from '../states/socketstate';

export default class TrainingRoom {
    private stage: Stage;
    private state: RoomState;
    private deployment_timeout: number = 999;
    private deployment_max: number = 4;
    private players_max: number = 1;

    public get connection(): GameSocket {
        return this.p1;
    }

    public get alive(): boolean {
        if (this.state === RoomState.DEAD) return false;

        return true;
    }

    public get interval(): number {
        const living_entity_count: number = this.stage.entities.filter(entity => entity.alive).length;
        return 1.4 + (0.2 * living_entity_count);
    }

    constructor(readonly key: string, private readonly p1: GameSocket) {
        this.stage = new Stage(7, 7, 1);
        this.state = RoomState.CREATED;

        this.connection.socket.on('deployment-ready', () => {
            if (this.connection.state !== SocketState.MATCHED) return;
            // Log.info('deployment-ready received from ' + connection.key + '.');
            this.connection.state = SocketState.DEPLOYMENT;
        });

        this.connection.socket.on('battle-ready', (deployment_payload: any) => {
            if (this.connection.state !== SocketState.DEPLOYMENT) return;
            this.connection.state = SocketState.BATTLE;
            this.connection.units = deployment_payload.entities;
        });

        this.connection.socket.on('resoluble', (resoluble_payload: any) => {
            if (this.connection.state !== SocketState.BATTLE) return;

            this.stage.battle.deserialize_resoluble(resoluble_payload.resoluble);
        });

        this.connection.state = SocketState.MATCHED;
        const serialized_stage: any = JSON.stringify(this.stage);

        this.connection.team = 0;
        this.connection.room = this;
        this.connection.socket.emit('matched', {
            team: this.connection.team,
            stage: serialized_stage,
            opponent: 'Training Bot',
            training: true
        });

        this.stage.battle.register_pre_tick_callback(this.on_pre_tick, this);
        this.stage.battle.register_post_tick_callback(this.on_post_tick, this);
    }

    public update(dt: number): void {
        switch (this.state) {
            case RoomState.CREATED:
                if (this.p1.state === SocketState.DEPLOYMENT) {
                    this.state = RoomState.DEPLOYMENT;

                    const deployment_axes: Array<number> = new Array<number>();
                    deployment_axes.push(0, 1);

                    const deployment_tiles: Array<Vector> = new Array<Vector>();
                    for (let i: number = 0; i < this.stage.height; i++) {
                        for (const axis of deployment_axes) {
                            deployment_tiles.push(new Vector(axis, i, 0));
                        }
                    }

                    this.connection.tiles = deployment_tiles;
                    this.connection.socket.emit('deployment-started', {
                        players_max: this.players_max,
                        deployment_max: this.deployment_max,
                        deployment_tiles: this.connection.tiles
                    });
                }
                break;

            case RoomState.DEPLOYMENT:
                this.deployment_timeout -= dt;

                if (this.connection.state === SocketState.BATTLE) {
                    this.state = RoomState.BATTLE;

                    let index: number = 1;
                    for (const unit of this.connection.units) {
                        if (!Stage.local_within_specific(unit[1], this.connection.tiles)) continue;
                        if (index > this.deployment_max) continue;

                        const entity: Entity = new Entity();
                        entity.identifier.class_key = unit[0];
                        entity.combat.alive = true;
                        entity.combat.current_health = 1;
                        entity.spatial = {
                            position: new Vector(unit[1].x, unit[1].y, unit[1].z),
                            facing: new Vector(1, -1, 0),
                            has_moved: false
                        };

                        this.stage.battle.add_entity(entity, this.connection.team);

                        index++;
                    }

                    this.populate_npcs();

                    const serialized_stage: any = JSON.stringify(this.stage);
                    this.connection.socket.emit('battle-started', {
                        stage: serialized_stage,
                        interval: this.interval
                    });
                }

                break;

            case RoomState.BATTLE:
                this.stage.battle.update(dt);
                this.stage.battle.set_async_interval(this.interval);

                if (this.stage.battle.get_team_wiped()) {
                    const teams_defeated: Array<number> = this.stage.battle.get_teams_defeated();
                    let winning_team: number = -1;

                    if (teams_defeated.filter(team => team === this.p1.team).length && !teams_defeated.filter(team => team === 1).length) {
                        winning_team = 1;
                    } else if (!teams_defeated.filter(team => team === this.p1.team).length && teams_defeated.filter(team => team === 1).length) {
                        winning_team = 0;
                    }

                    this.complete_match(winning_team);
                }

                const p1_entity_count: number = this.stage.entities.filter(entity => entity.team === this.p1.team).length;
                const p2_entity_count: number = this.stage.entities.filter(entity => entity.team === 1).length;
                if (!p1_entity_count || !p2_entity_count) {
                    let winning_team: number = -1;

                    if (!p1_entity_count && p2_entity_count) {
                        winning_team = 1;
                    } else if (p1_entity_count && !p2_entity_count) {
                        winning_team = this.p1.team;
                    }

                    this.complete_match(winning_team);
                }

                break;
        }
    }

    public complete_match(winning_team: number): void {
        this.connection.socket.emit('battle-completed', {
            winning_team: winning_team
        });

        Log.info(this.key + ' match ended successfully.');
        this.close_soft();
    }

    /**
     * Close the room gracefully after match completion
     */
    public close_soft(): void {
        if (this.connection.alive) {
            this.connection.room = null;
            this.connection.units = null;
            this.connection.tiles = null;
            this.connection.socket.removeAllListeners();

            this.connection.state = SocketState.CREATED;
        }

        this.state = RoomState.DEAD;
    }

    /**
     * Close the room forcefully after a disconnection or failure, disconnecting all remaining clients
     */
    public close_hard(): void {
        this.close_soft();

        if (this.connection.alive) {
            this.connection.socket.emit('room-closed');
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
        this.connection.socket.emit('post-tick', {
            turn: this.stage.battle.serialize_turn(),
            interval: this.stage.battle.get_async_interval()
        });
    }

    private populate_npcs(): void {
        const bow: Entity = new Entity();
        bow.identifier.class_key = 'bow_unit';
        bow.combat.alive = true;
        bow.combat.current_health = 1;
        bow.spatial = {
            position: new Vector(5, 0),
            facing: new Vector(-1, 1, 0),
            has_moved: false
        };

        const sword: Entity = new Entity();
        sword.identifier.class_key = 'sword_unit';
        sword.combat.alive = true;
        sword.combat.current_health = 1;
        sword.spatial = {
            position: new Vector(5, 3),
            facing: new Vector(-1, 1, 0),
            has_moved: false
        };

        const spear: Entity = new Entity();
        spear.identifier.class_key = 'spear_unit';
        spear.combat.alive = true;
        spear.combat.current_health = 1;
        spear.spatial = {
            position: new Vector(5, 6),
            facing: new Vector(-1, 1, 0),
            has_moved: false
        };

        this.stage.battle.add_entity(bow, 1);
        this.stage.battle.add_entity(sword, 1);
        this.stage.battle.add_entity(spear, 1);
    }
}