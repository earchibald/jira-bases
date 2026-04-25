// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { Plugin } from "obsidian";
import { registerHoverPreview } from "./hover-preview";
import type { IssueService, IssueState } from "./issue-service";

const BASE_URL = "https://jira.example.com";

function createMockPlugin(): Plugin {
  const listeners: Array<{
    el: Document | HTMLElement;
    type: string;
    handler: EventListener;
  }> = [];
  return {
    registerDomEvent(el: Document | HTMLElement, type: string, handler: EventListener) {
      listeners.push({ el, type, handler });
      el.addEventListener(type, handler);
    },
  } as unknown as Plugin;
}

function createMockService(): IssueService {
  return {
    lookup: vi.fn((key: string, cb: (state: IssueState) => void) => {
      cb({
        state: "ok",
        issue: {
          key,
          summary: "Test issue",
          status: "In Progress",
          type: "Task",
          priority: "High",
          assignee: "Alice",
          reporter: "Bob",
          labels: [],
          updated: "2026-04-15T10:00:00.000+0000",
          url: `${BASE_URL}/browse/${key}`,
        },
        refreshing: false,
      });
    }),
  } as unknown as IssueService;
}

function createAnchor(text: string, href: string): HTMLAnchorElement {
  const a = document.createElement("a");
  a.href = href;
  a.textContent = text;
  return a;
}

function setViewportSize(width: number, height: number): void {
  Object.defineProperty(window, "innerWidth", {
    writable: true,
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, "innerHeight", {
    writable: true,
    configurable: true,
    value: height,
  });
  Object.defineProperty(window, "scrollX", {
    writable: true,
    configurable: true,
    value: 0,
  });
  Object.defineProperty(window, "scrollY", {
    writable: true,
    configurable: true,
    value: 0,
  });
}

function mockElementRect(el: HTMLElement, rect: Partial<DOMRect>): void {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    x: rect.x ?? 0,
    y: rect.y ?? 0,
    width: rect.width ?? 0,
    height: rect.height ?? 0,
    top: rect.top ?? 0,
    right: rect.right ?? 0,
    bottom: rect.bottom ?? 0,
    left: rect.left ?? 0,
    toJSON: () => ({}),
  });
}

describe("hover-preview boundary detection", () => {
  let container: HTMLElement;
  let plugin: Plugin;
  let service: IssueService;
  let appendChildSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    document.body.innerHTML = "";
    container = document.createElement("div");
    document.body.appendChild(container);
    plugin = createMockPlugin();
    service = createMockService();
    setViewportSize(1000, 800);

    // Spy on appendChild to mock popover dimensions when it's added
    const originalAppendChild = document.body.appendChild.bind(document.body);
    appendChildSpy = vi.spyOn(document.body, "appendChild").mockImplementation((node: Node) => {
      const result = originalAppendChild(node);
      if (node instanceof HTMLElement && node.classList.contains("jb-hover-popover")) {
        mockElementRect(node, {
          width: 420,
          height: 200,
        });
      }
      return result;
    });
  });

  afterEach(() => {
    appendChildSpy.mockRestore();
  });

  it("positions popover below anchor by default when no boundary violations", () => {
    registerHoverPreview(plugin, service, () => BASE_URL);

    const anchor = createAnchor("ABC-123", `${BASE_URL}/browse/ABC-123`);
    container.appendChild(anchor);

    // Position anchor in safe area (plenty of space below and to the right)
    mockElementRect(anchor, {
      left: 100,
      top: 100,
      right: 180,
      bottom: 120,
      width: 80,
      height: 20,
    });

    anchor.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));

    const popover = document.querySelector(".jb-hover-popover") as HTMLElement;
    expect(popover).not.toBeNull();

    // Popover should be positioned below anchor (top = anchor.bottom + 4)
    // and at anchor.left
    const expectedTop = 120 + 4; // anchor.bottom + 4
    const expectedLeft = 100; // anchor.left

    // Parse the actual position from style
    const top = parseInt(popover.style.top);
    const left = parseInt(popover.style.left);

    expect(top).toBe(expectedTop);
    expect(left).toBe(expectedLeft);
  });

  it("repositions popover to the left when it would overflow right edge", () => {
    registerHoverPreview(plugin, service, () => BASE_URL);

    const anchor = createAnchor("XYZ-456", `${BASE_URL}/browse/XYZ-456`);
    container.appendChild(anchor);

    // Position anchor near right edge
    // anchor.left = 650, popover width = 420
    // 650 + 420 = 1070 > 1000 (viewport width)
    // Should reposition to: anchor.right - popover.width
    mockElementRect(anchor, {
      left: 650,
      top: 100,
      right: 730,
      bottom: 120,
      width: 80,
      height: 20,
    });

    anchor.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));

    const popover = document.querySelector(".jb-hover-popover") as HTMLElement;
    expect(popover).not.toBeNull();

    const left = parseInt(popover.style.left);
    const expectedLeft = Math.max(0, 730 - 420); // anchor.right - popover.width

    expect(left).toBe(expectedLeft);
  });

  it("repositions popover above anchor when it would overflow bottom edge", () => {
    registerHoverPreview(plugin, service, () => BASE_URL);

    const anchor = createAnchor("DEF-789", `${BASE_URL}/browse/DEF-789`);
    container.appendChild(anchor);

    // Position anchor near bottom edge
    // anchor.bottom = 700, popover height = 200
    // 700 + 200 + 4 = 904 > 800 (viewport height)
    // Should reposition above: anchor.top - popover.height - 4
    mockElementRect(anchor, {
      left: 100,
      top: 680,
      right: 180,
      bottom: 700,
      width: 80,
      height: 20,
    });

    anchor.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));

    const popover = document.querySelector(".jb-hover-popover") as HTMLElement;
    expect(popover).not.toBeNull();

    const top = parseInt(popover.style.top);
    const expectedTop = 680 - 200 - 4; // anchor.top - popover.height - 4

    expect(top).toBe(expectedTop);
  });

  it("repositions popover to left and above when both boundaries violated", () => {
    registerHoverPreview(plugin, service, () => BASE_URL);

    const anchor = createAnchor("GHI-101", `${BASE_URL}/browse/GHI-101`);
    container.appendChild(anchor);

    // Position anchor near both right and bottom edges
    mockElementRect(anchor, {
      left: 650,
      top: 680,
      right: 730,
      bottom: 700,
      width: 80,
      height: 20,
    });

    anchor.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));

    const popover = document.querySelector(".jb-hover-popover") as HTMLElement;
    expect(popover).not.toBeNull();

    const top = parseInt(popover.style.top);
    const left = parseInt(popover.style.left);

    // Should be above and to the left
    expect(top).toBe(680 - 200 - 4); // anchor.top - popover.height - 4
    expect(left).toBe(Math.max(0, 730 - 420)); // anchor.right - popover.width
  });

  it("includes scroll offsets in final position", () => {
    Object.defineProperty(window, "scrollX", {
      writable: true,
      configurable: true,
      value: 50,
    });
    Object.defineProperty(window, "scrollY", {
      writable: true,
      configurable: true,
      value: 100,
    });

    registerHoverPreview(plugin, service, () => BASE_URL);

    const anchor = createAnchor("JKL-202", `${BASE_URL}/browse/JKL-202`);
    container.appendChild(anchor);

    mockElementRect(anchor, {
      left: 100,
      top: 100,
      right: 180,
      bottom: 120,
      width: 80,
      height: 20,
    });

    anchor.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));

    const popover = document.querySelector(".jb-hover-popover") as HTMLElement;
    expect(popover).not.toBeNull();

    const top = parseInt(popover.style.top);
    const left = parseInt(popover.style.left);

    // Should include scroll offsets
    expect(top).toBe(120 + 4 + 100); // anchor.bottom + 4 + scrollY
    expect(left).toBe(100 + 50); // anchor.left + scrollX
  });

  it("does not create duplicate popover for same key", () => {
    registerHoverPreview(plugin, service, () => BASE_URL);

    const anchor = createAnchor("MNO-303", `${BASE_URL}/browse/MNO-303`);
    container.appendChild(anchor);

    mockElementRect(anchor, {
      left: 100,
      top: 100,
      right: 180,
      bottom: 120,
      width: 80,
      height: 20,
    });

    anchor.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));

    const firstPopover = document.querySelector(".jb-hover-popover");
    expect(firstPopover).not.toBeNull();

    // Try to trigger again
    anchor.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));

    const allPopovers = document.querySelectorAll(".jb-hover-popover");
    expect(allPopovers.length).toBe(1);
  });

  it("constrains left position to not be negative when repositioning", () => {
    registerHoverPreview(plugin, service, () => BASE_URL);

    const anchor = createAnchor("PQR-404", `${BASE_URL}/browse/PQR-404`);
    container.appendChild(anchor);

    // Position anchor near right edge but with small width
    // anchor.left = 800, anchor.right = 820, popover width = 420
    // 800 + 420 = 1220 > 1000, so triggers right overflow
    // Repositions to: Math.max(0, 820 - 420) = Math.max(0, 400) = 400
    // But let's make anchor.right small enough that the repositioning would go negative
    // anchor.left = 900, anchor.right = 920
    // 900 + 420 = 1320 > 1000, triggers overflow
    // Repositions to: Math.max(0, 920 - 420) = 500
    // Let's try: anchor.left = 950, anchor.right = 970
    // 950 + 420 = 1370 > 1000, triggers overflow
    // Repositions to: Math.max(0, 970 - 420) = 550
    // We need anchor.right < 420 to test the clamping
    // anchor.left = 980, anchor.right = 1000, width = 20
    // 980 + 420 = 1400 > 1000, triggers overflow
    // Repositions to: Math.max(0, 1000 - 420) = 580

    // Let me reconsider: we want to test the Math.max(0, ...) clamping
    // This only happens if anchor.right - popover.width < 0
    // So anchor.right must be < 420
    // But also anchor.left + popover.width must be > viewport (1000)
    // This is impossible with viewport=1000 and popover=420
    // Unless... we make the viewport smaller!

    // Reset viewport to be very narrow
    setViewportSize(400, 800);

    // anchor.left = 100, anchor.right = 120
    // 100 + 420 = 520 > 400, triggers right overflow
    // Repositions to: Math.max(0, 120 - 420) = Math.max(0, -300) = 0
    mockElementRect(anchor, {
      left: 100,
      top: 100,
      right: 120,
      bottom: 120,
      width: 20,
      height: 20,
    });

    anchor.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));

    const popover = document.querySelector(".jb-hover-popover") as HTMLElement;
    expect(popover).not.toBeNull();

    const left = parseInt(popover.style.left);
    expect(left).toBe(0); // Should be clamped to 0, not negative
  });

  it("works with live preview span.cm-link elements", () => {
    registerHoverPreview(plugin, service, () => BASE_URL);

    const span = document.createElement("span");
    span.className = "cm-link";
    span.textContent = "ABC-123";
    container.appendChild(span);

    mockElementRect(span, {
      left: 100,
      top: 100,
      right: 180,
      bottom: 120,
      width: 80,
      height: 20,
    });

    span.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));

    const popover = document.querySelector(".jb-hover-popover") as HTMLElement;
    expect(popover).not.toBeNull();
    expect(popover.getAttribute("data-jb-anchor-key")).toBe("ABC-123");
  });
});
