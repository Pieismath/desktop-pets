import { contextBridge, ipcRenderer } from 'electron';
import type { PetAction, PetViewModel } from '@desktop-pets/shared';

const petApi = {
  init: () => ipcRenderer.invoke('pet:init'),
  onUpdate: (cb: (vm: PetViewModel) => void) => {
    ipcRenderer.on('pet:update', (_event, vm: PetViewModel) => cb(vm));
  },
  action: (action: PetAction) => ipcRenderer.send('pet:action', action),
  dragStart: () => ipcRenderer.send('pet:drag-start'),
  dragEnd: (moved: boolean) => ipcRenderer.send('pet:drag-end', moved),
};

export type PetApi = typeof petApi;

contextBridge.exposeInMainWorld('petApi', petApi);
