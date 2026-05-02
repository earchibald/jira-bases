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

export class Plugin {
  app: unknown;
  manifest: unknown;
  constructor(app: unknown, manifest?: unknown) {
    this.app = app;
    this.manifest = manifest;
  }
}

export async function requestUrl(_request: unknown) {
  throw new Error("requestUrl mock not implemented");
}

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

function augmentElement(el: any): any {
  el.empty = function () {
    this.innerHTML = "";
  };
  el.setText = function (text: string) {
    this.textContent = text;
  };
  el.addClass = function (cls: string) {
    this.classList.add(cls);
  };
  el.createEl = function (tag: string, options?: any) {
    const child = document.createElement(tag);
    if (options?.text) {
      child.textContent = options.text;
    }
    if (options?.cls) {
      const classes = Array.isArray(options.cls) ? options.cls : [options.cls];
      for (const c of classes) child.classList.add(c);
    }
    augmentElement(child);
    this.appendChild(child);
    return child;
  };
  el.createDiv = function (options?: any) {
    return el.createEl("div", options);
  };
  return el;
}

export class Modal {
  app: unknown;
  contentEl: HTMLElement & {
    empty: () => void;
    createEl: (tag: string, options?: any) => HTMLElement;
  };
  titleEl: HTMLElement & { setText: (text: string) => void };

  constructor(app: unknown) {
    this.app = app;
    this.contentEl = augmentElement(document.createElement("div"));
    this.titleEl = augmentElement(document.createElement("div"));
  }

  open() {}
  close() {}
  onOpen() {}
  onClose() {}
}

export class Setting {
  descEl: { empty: () => void; createEl: () => void } = {
    empty: () => {},
    createEl: () => {},
  };
  private settingEl?: HTMLElement;
  private nameEl?: HTMLElement;
  private controlEl?: HTMLElement;

  constructor(containerEl?: unknown) {
    if (containerEl && typeof (containerEl as any).appendChild === "function") {
      const parent = containerEl as HTMLElement;
      this.settingEl = document.createElement("div");
      this.settingEl.className = "setting-item";

      this.nameEl = document.createElement("div");
      this.nameEl.className = "setting-item-name";

      this.controlEl = document.createElement("div");
      this.controlEl.className = "setting-item-control";

      this.settingEl.appendChild(this.nameEl);
      this.settingEl.appendChild(this.controlEl);
      parent.appendChild(this.settingEl);
    }
  }

  setName(name: string): this {
    if (this.nameEl) {
      this.nameEl.textContent = name;
    }
    return this;
  }

  setDesc(_desc: string): this {
    return this;
  }

  addText(_cb: (text: any) => void): this {
    return this;
  }

  addDropdown(_cb: (dropdown: any) => void): this {
    return this;
  }

  addToggle(
    cb: (toggle: {
      setValue: (value: boolean) => any;
      onChange: (cb: (value: boolean) => void) => void;
    }) => void,
  ): this {
    if (!this.controlEl) return this;
    const toggleEl = document.createElement("input");
    toggleEl.type = "checkbox";
    this.controlEl.appendChild(toggleEl);

    const toggle = {
      setValue: (value: boolean) => {
        toggleEl.checked = value;
        return toggle;
      },
      onChange: (callback: (value: boolean) => void) => {
        toggleEl.addEventListener("change", () => {
          callback(toggleEl.checked);
        });
      },
    };

    cb(toggle);
    return this;
  }

  addButton(
    cb: (button: {
      setButtonText: (text: string) => any;
      setCta: () => any;
      onClick: (cb: () => void) => void;
    }) => void,
  ): this {
    if (!this.controlEl) return this;
    const buttonEl = document.createElement("button");
    this.controlEl.appendChild(buttonEl);

    const button = {
      setButtonText: (text: string) => {
        buttonEl.textContent = text;
        return button;
      },
      setCta: () => {
        buttonEl.className = "mod-cta";
        return button;
      },
      onClick: (callback: () => void) => {
        buttonEl.addEventListener("click", callback);
      },
    };

    cb(button);
    return this;
  }
}
