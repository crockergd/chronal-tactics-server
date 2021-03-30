import GameRoom from './gameroom';
import ClientSettings from '../sync/clientsettings';
import SocketState from '../states/socketstate';
import { Vector } from 'turn-based-combat-framework';
import TrainingRoom from './trainingroom';
import { Socket } from 'socket.io';

export default class GameSocket {
    public state: SocketState;

    public room: GameRoom | TrainingRoom;
    public settings: ClientSettings;
    public team: number;

    public units: Array<[string, Vector]>;
    public tiles: Array<Vector>;

    public get socket(): Socket {
        return this._socket;
    }

    public get alive(): boolean {
        if (!this.socket.connected) return false;
        if (this.state === SocketState.DEAD) return false;

        return true;
    }

    constructor(readonly key: string, private readonly _socket: Socket) {
        this.state = SocketState.CREATED;
        
        this.socket.on('disconnect', () => {
            this.state = SocketState.DEAD;
        });
    }

    public close(): void {
        this.room = null;
        // this.socket.disconnect(true);
    }
}