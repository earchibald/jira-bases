export class SuggestModal<T> {
  app: unknown;
  emptyStateText = "";
  constructor(app: unknown) {
    this.app = app;
  }
  setPlaceholder(_text: string) {}
}

export class Notice {
  constructor(_msg: string) {}
}

export class App {}

export class PluginSettingTab {
  app: unknown;
  containerEl = {
    empty: () => {},
    createEl: () => ({ createEl: () => {} }),
  };
  constructor(app: unknown, _plugin: unknown) {
    this.app = app;
  }
  display() {}
}

export class Setting {
  descEl = { empty: () => {}, createEl: () => {} };
  constructor(_containerEl: unknown) {}
  setName(_name: string) { return this; }
  setDesc(_desc: string) { return this; }
  addText(_cb: (text: any) => void) { return this; }
  addButton(_cb: (btn: any) => void) { return this; }
  addToggle(_cb: (toggle: any) => void) { return this; }
  addDropdown(_cb: (dropdown: any) => void) { return this; }
}
