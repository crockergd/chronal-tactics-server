import GameSocket from './gamesocket';
import { Battle, TickMode } from 'turn-based-combat-framework';

export default class GameRoom {
    private battle: Battle;

    public active: boolean;

    private get connections(): Array<GameSocket> {
        return [this.p1, this.p2];
    }

    constructor(readonly key: string, private readonly p1: GameSocket, private readonly p2: GameSocket) {
        const payload: any = {
            test_data: 'text'
        };

        for (const connection of this.connections) {
            connection.socket.emit('matched', payload);
            connection.matched = true;
            connection.room = this;
        }

        this.battle = new Battle(TickMode.ASYNC);
        this.active = true;
    }

    public tick(dt: number): void {
        this.battle.update(dt);
    }

    public close(): void {
        if (!this.active) return;

        this.active = false;

        for (const connection of this.connections) {
            connection.matched = false;
            connection.room = null;

            if (connection.socket.connected) {
                connection.socket.emit('room-closed');
            }
        }        

        console.log(this.key + ' closed.');
    }
}