export default class UID {
    private map: Map<string, number>;

    constructor() {
        this.map = new Map<string, number>();
    }

    public next(context: string): string {
        const entry: number = this.map.get(context) || 0;
        const id: string = context + '-' + entry;
        this.map.set(context, entry + 1);

        return id;
    }
}