import { Resoluble, Move, Vector, Face, Entity } from 'turn-based-combat-framework';
import Stage from '../sync/stage';

export default abstract class ResolubleManager {
    public static prepare_resolubles(resolubles: Array<Resoluble>): void {
        for (const resoluble of resolubles) {
            switch (resoluble.type) {
                case 'Face':
                    resoluble.priority = -2;
                    break;
                case 'Move':
                    resoluble.priority = -1;
                    break;
                case 'Attack':
                    resoluble.priority = 1;
                    break;
            }
        }

        resolubles = resolubles.sort((lhs, rhs) => {
            if (lhs.priority > rhs.priority) {
                return 1;
            } else if (lhs.priority < rhs.priority) {
                return -1;
            } else {
                return 0;
            }
        });

        const exclusive_types: Array<string> = ['Face', 'Move'];
        for (const type of exclusive_types) {
            const typed_resolubles: Array<Resoluble> = resolubles.filter(resoluble => resoluble.type === type);
            const distinct_entity_keys: Array<string> = Array.from(new Set(typed_resolubles.map(resoluble => (resoluble as any).source.key)));

            for (const distinct_entity_key of distinct_entity_keys) {
                const key_filtered_resolubles: Array<Resoluble> = typed_resolubles.filter(resoluble => (resoluble as any).source.key === distinct_entity_key)
                    .sort((lhs, rhs) => {
                        if (lhs.timestamp > rhs.timestamp) {
                            return 1;
                        } else if (lhs.timestamp < rhs.timestamp) {
                            return -1;
                        } else {
                            return 0;
                        }
                    });

                if (key_filtered_resolubles.length < 2) continue;

                for (let i: number = 0; i < key_filtered_resolubles.length - 1; i++) {
                    key_filtered_resolubles[i].invalidate();
                }
            }
        }
    }

    public static validate_moves(stage: Stage, resolubles: Array<Resoluble>): void {
        let occupied_positions: Array<[Entity, Vector, boolean]> = [];
        let contested_positions: Array<[Entity, Entity, Move]> = [];

        // culls movement resolubles that would place an entity in unpathable terrain (on top of another entity or outside the map bounds)
        for (const entity of stage.entities) {
            const face: Face = resolubles.find(resoluble => resoluble.type === 'Face' && (resoluble as any).source.key === entity.key) as any;
            if (!face) continue;
            const move: Move = resolubles.find(resoluble => resoluble.type === 'Move' && (resoluble as any).source.key === entity.key) as any;
            if (!move) continue;

            const new_position: Vector = Move.calculate_new_position(move.source.spatial.position, face.facing);
            if (new_position.x > stage.width - 1) {
                move.invalidate();
                continue;
            }
            if (new_position.y > stage.height - 1) {
                move.invalidate();
                continue;
            }
            if (new_position.x < 0) {
                move.invalidate();
                continue;
            }
            if (new_position.y < 0) {
                move.invalidate();
                continue;
            }

            // flag potentially unpathable terrain, these are valid moves if the entity currently on the tile will also move this turn
            const contested_entity: Entity = stage.battle.get_entity_by_position(new_position);
            if (contested_entity) {
                contested_positions.push([entity, contested_entity, move]);
            }
        }

        // invalidate moves that take an entity onto an occupied tile that the occupier is not moving off of
        for (const contested_position of contested_positions) {
            const move: Move = resolubles.find(resoluble => resoluble.type === 'Move' && (resoluble as any).source.key === contested_position[1].key) as any;
            if (move && move.active) continue; // entity can continue if occupier is moving this turn
            contested_position[2].invalidate();
        }

        for (const entity of stage.entities) {
            const face: Face = resolubles.find(resoluble => resoluble.type === 'Face' && (resoluble as any).source.key === entity.key) as any;
            if (!face) continue;
            const move: Move = resolubles.find(resoluble => resoluble.type === 'Move' && (resoluble as any).source.key === entity.key) as any;
            if (!move || !move.active) continue;

            const new_position: Vector = Move.calculate_new_position(move.source.spatial.position, face.facing);
            occupied_positions.push([entity, new_position, false]);
        }

        // kills entities that path onto the same tile on the same turn, can't be handled above because the resolubles haven't resolved yet
        for (const outer of occupied_positions) {
            for (const inner of occupied_positions) {
                if (outer[1].x === inner[1].x && outer[1].y === inner[1].y && outer[1].z === inner[1].z &&
                    outer[0].key !== inner[0].key) outer[2] = true;
            }
        }

        for (const fatal_position of occupied_positions.filter(occupied_position => occupied_position[2])) {
            stage.battle.call_resoluble('Death', true, fatal_position[0]);
        }
    }
}