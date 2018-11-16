import GameSocket from './gamesocket';
import { Entity, Vector, Resoluble } from 'turn-based-combat-framework';
import Stage from '../sync/stage';
import ResolubleManager from './resolublemanager';
import Log from './log';

export default class GameRoom {
    private stage: Stage;

    public active: boolean;

    private get connections(): Array<GameSocket> {
        return [this.p1, this.p2];
    }

    constructor(readonly key: string, private readonly p1: GameSocket, private readonly p2: GameSocket) {
        this.active = true;
        this.stage = new Stage(7, 7, 1);

        this.begin_match();

        this.stage.battle.register_pre_tick_callback(this.on_pre_tick, this);
        this.stage.battle.register_post_tick_callback(this.on_post_tick, this);

        for (const connection of this.connections) {
            connection.socket.on('resoluble', (data: any) => {
                this.stage.battle.deserialize_resoluble(data.resoluble);
            });
        }
    }

    public update(dt: number): void {
        this.stage.battle.update(dt);

        if (this.stage.battle.get_team_wiped()) {
            this.close();
        }
    }

    public close(): void {
        if (!this.active) return;

        this.active = false;

        for (const connection of this.connections) {
            connection.matched = false;
            connection.room = null;
            connection.initialized = false;

            if (connection.socket.connected) {
                connection.socket.emit('room-closed');
            }
        }

        Log.info(this.key + ' closed.');
    }

    private on_pre_tick(): void {
        for (const entity of this.stage.entities) {
            this.stage.battle.call_resoluble('Attack', true, entity);
        }

        const delayed_resolubles: Array<Resoluble> = this.stage.battle.get_delayed_resolubles()

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
        let index: number = 0;
        for (const class_key of this.p1.settings.units) {
            const entity: Entity = new Entity();
            entity.identifier.class_key = class_key;
            entity.combat.alive = true;
            entity.combat.current_health = 1;
            entity.spatial = {
                position: new Vector(0, 0 + index, 0),
                facing: new Vector(1, -1, 0),
                has_moved: false
            }

            this.stage.battle.add_entity(entity, 0);

            index++;
        }

        index = 0;
        for (const class_key of this.p2.settings.units) {
            const entity: Entity = new Entity();
            entity.identifier.class_key = class_key;
            entity.combat.alive = true;
            entity.combat.current_health = 1;
            entity.spatial = {
                position: new Vector(4, 0 + index, 0),
                facing: new Vector(-1, 1, 0),
                has_moved: false
            }

            this.stage.battle.add_entity(entity, 1);

            index++;
        }

        const serialized_stage: any = JSON.stringify(this.stage);
        const payload1: any = {
            team: 0,
            stage: serialized_stage
        };
        const payload2: any = {
            team: 1,
            stage: serialized_stage
        };

        this.p1.socket.emit('matched', payload1);
        this.p1.matched = true;
        this.p1.room = this;

        this.p2.socket.emit('matched', payload2);
        this.p2.matched = true;
        this.p2.room = this;
    }
}