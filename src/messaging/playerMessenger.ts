import { PerformanceMessenger } from './performanceMessenger';

export const createPlayerMessenger = (playerNumber: string | undefined) => {
    return new PerformanceMessenger('player', { playerNumber });
};
