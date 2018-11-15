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
            let latest_resoluble: Resoluble;

            for (const typed_resoluble of typed_resolubles) {
                typed_resoluble.active = false;

                if (!latest_resoluble || latest_resoluble.timestamp < typed_resoluble.timestamp){
                    latest_resoluble = typed_resoluble;
                }
            }

            if (latest_resoluble) latest_resoluble.active = true;
        }

        resolubles = resolubles.filter(resoluble => resoluble.active);
    }
}