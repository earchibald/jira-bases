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

export class Modal {
  app: unknown;
  contentEl: HTMLElement & { empty: () => void; createEl: (tag: string, options?: any) => HTMLElement };
  titleEl: HTMLElement & { setText: (text: string) => void };

  constructor(app: unknown) {
    this.app = app;

    const contentEl = document.createElement("div") as any;
    contentEl.empty = function() {
      this.innerHTML = "";
    };
    contentEl.createEl = function(tag: string, options?: any) {
      const el = document.createElement(tag);
      if (options?.text) {
        el.textContent = options.text;
      }
      this.appendChild(el);
      return el;
    };
    this.contentEl = contentEl;

    const titleEl = document.createElement("div") as any;
    titleEl.setText = function(text: string) {
      this.textContent = text;
    };
    this.titleEl = titleEl;
  }

  open() {}
  close() {}
  onOpen() {}
  onClose() {}
}

export class Setting {
  private settingEl: HTMLElement;
  private nameEl: HTMLElement;
  private controlEl: HTMLElement;

  constructor(containerEl: HTMLElement) {
    this.settingEl = document.createElement("div");
    this.settingEl.className = "setting-item";

    this.nameEl = document.createElement("div");
    this.nameEl.className = "setting-item-name";

    this.controlEl = document.createElement("div");
    this.controlEl.className = "setting-item-control";

    this.settingEl.appendChild(this.nameEl);
    this.settingEl.appendChild(this.controlEl);
    containerEl.appendChild(this.settingEl);
  }

  setName(name: string): this {
    this.nameEl.textContent = name;
    return this;
  }

  addToggle(cb: (toggle: { setValue: (value: boolean) => any; onChange: (cb: (value: boolean) => void) => void }) => void): this {
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

  addButton(cb: (button: { setButtonText: (text: string) => any; setCta: () => any; onClick: (cb: () => void) => void }) => void): this {
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
