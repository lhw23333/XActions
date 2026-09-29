// Copyright (c) 2024-2026 nich (@nichxbt). Licensed under Apache-2.0.
// @author nich (@nichxbt)
import { contextBridge, ipcRenderer } from 'electron';
import type { WorkbenchAPI } from '../shared/contracts';

const api: WorkbenchAPI = {
  bootstrap: () => ipcRenderer.invoke('workbench:bootstrap'),
  connect: () => ipcRenderer.invoke('workbench:connect'),
  disconnect: () => ipcRenderer.invoke('workbench:disconnect'),
  runTool: (name, args) => ipcRenderer.invoke('workbench:runTool', name, args),
  history: () => ipcRenderer.invoke('workbench:history'),
  drafts: () => ipcRenderer.invoke('workbench:drafts'),
  approveDraft: id => ipcRenderer.invoke('workbench:approveDraft', id),
  discardDraft: id => ipcRenderer.invoke('workbench:discardDraft', id),
  saveConfig: input => ipcRenderer.invoke('workbench:saveConfig', input),
  exportRun: (id, format) => ipcRenderer.invoke('workbench:exportRun', id, format),
  openExternal: url => ipcRenderer.invoke('workbench:openExternal', url),
  onChange: callback => {
    const listener = () => callback();
    ipcRenderer.on('workbench:changed', listener);
    return () => ipcRenderer.removeListener('workbench:changed', listener);
  },
};
contextBridge.exposeInMainWorld('workbench', api);
