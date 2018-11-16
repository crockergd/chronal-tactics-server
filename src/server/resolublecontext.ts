import { Resoluble } from 'turn-based-combat-framework';

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
                const key_filtered_resolubles: Array<Resoluble> = typed_resolubles.filter(resoluble => (resoluble as any).source.key === distinct_entity_key);
                
                let latest_resoluble: Resoluble;

                for (const key_filtered_resoluble of key_filtered_resolubles) {
                    key_filtered_resoluble.active = false;
    
                    if (!latest_resoluble || latest_resoluble.timestamp < key_filtered_resoluble.timestamp) {
                        latest_resoluble = key_filtered_resoluble;
                    }
                }
    
                if (latest_resoluble) latest_resoluble.active = true;
            }     
        }
    }
}