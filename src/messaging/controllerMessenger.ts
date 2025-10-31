import { PerformanceMessenger } from './performanceMessenger';

let controllerMessenger: PerformanceMessenger | null = null;

export const getControllerMessenger = () => {
    if (!controllerMessenger) {
        controllerMessenger = new PerformanceMessenger('controller');
    }
    return controllerMessenger;
};

export const disposeControllerMessenger = () => {
    controllerMessenger?.dispose();
    controllerMessenger = null;
};
