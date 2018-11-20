import sio from 'socket.io';
import GameSocket from './gamesocket';
import GameRoom from './gameroom';
import UID from './uid';
import Log from './log';
import SocketState from '../states/socketstate';

export default class GameServer {
    private readonly UPDATE_RATE: number = 60;

    private _io: SocketIO.Server;

    private connections: Array<GameSocket>;
    private rooms: Array<GameRoom>;

    private uid: UID;
    private last_update_now: number;

    public get io(): SocketIO.Server {
        return this._io;
    }

    constructor(port: number) {
        this._io = sio(port);

        this.connections = new Array<GameSocket>();
        this.rooms = new Array<GameRoom>();

        this.uid = new UID();

        this.io.on('connection', (socket: SocketIO.Socket) => {
            const connection: GameSocket = new GameSocket(this.uid.next('socket'), socket);
            this.connections.push(connection);
            Log.info('Connection ' + connection.key + ' added.');
        });

        setInterval(this.update.bind(this), 1000 / this.UPDATE_RATE);
    }

    private update(): void {
        this.cleanup();
        this.initialize();
        this.matchmake();
        const dt: number = this.calculate_dt();

        for (const room of this.rooms) {
            room.update(dt);
        }
    }

    private initialize(): void {
        const uninitialized_connections: Array<GameSocket> = this.connections.filter(connection => connection.state === SocketState.CREATED);
        for (const connection of uninitialized_connections) {
            connection.socket.on('matchmake', (settings: any) => {
                connection.settings = settings;
                Log.info('Connection ' + connection.key + ' began matchmaking.');

                connection.state = SocketState.MATCHMAKING;
            });

            connection.state = SocketState.INITIALIZED;
        }
    }

    private cleanup(): void {
        const dead_connections: Array<GameSocket> = this.connections.filter(connection => !connection.alive);
        if (!dead_connections.length) return;

        for (const connection of dead_connections) {
            Log.info('Connection ' + connection.key + ' removed.');
            if (connection.room) connection.room.close();
            connection.close();
        }

        this.rooms = this.rooms.filter(room => room.alive);
        this.connections = this.connections.filter(connection => connection.alive);
    }

    private matchmake(): void {
        const unmatched_connections: Array<GameSocket> = this.connections.filter(connection => connection.state === SocketState.MATCHMAKING);
        if (unmatched_connections.length < 2) return;

        const p1: GameSocket = unmatched_connections[0];
        const p2: GameSocket = unmatched_connections[1];

        const room: GameRoom = new GameRoom(this.uid.next('room'), p1, p2);
        Log.info('Connections ' + p1.key + ' and ' + p2.key + ' matched into ' + room.key + '.');

        this.rooms.push(room);
    }

    private calculate_dt(): number {
        const now: number = Date.now();
        const dt: number = now - this.last_update_now;
        this.last_update_now = Date.now();

        return dt / 1000;
    }
}