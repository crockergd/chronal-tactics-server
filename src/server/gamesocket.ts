import GameRoom from './gameroom';
import ClientSettings from '../sync/clientsettings';
import SocketState from '../states/socketstate';

export default class GameSocket {
    public state: SocketState;

    public initialized: boolean;
    public active: boolean;
    public matched: boolean;
    public room: GameRoom;
    public settings: ClientSettings;
    public team: number;

    public get socket(): SocketIO.Socket {
        return this._socket;
    }

    public get alive(): boolean {
        if (!this.active) return false;
        if (!this.socket.connected) return false;
        if (!this.initialized) return true;

        return true;
    }

    constructor(readonly key: string, private readonly _socket: SocketIO.Socket) {
        this.state = SocketState.CREATED;
        this.initialized = false;
        this.active = true;
        this.matched = false;

        this.socket.on('disconnect', () => {
            this.active = false;
        });
    }
}