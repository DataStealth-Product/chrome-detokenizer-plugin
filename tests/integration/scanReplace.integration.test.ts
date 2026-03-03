import { ReplaceEngine } from "../../extension/src/content/replaceEngine";
import { ScanEngine } from "../../extension/src/content/scanEngine";
import { DefaultTokenPatternProvider } from "../../extension/src/content/tokenPatternProvider";

describe("scan and replace integration", () => {
  it("detects and replaces tokens in text nodes", () => {
    document.body.innerHTML = `<div id="root">Employee: [[TOKEN-Name-J]]</div>`;

    const scanEngine = new ScanEngine(new DefaultTokenPatternProvider());
    const replaceEngine = new ReplaceEngine();

    const detection = scanEngine.scanRoots([document]);
    expect(detection.tokens).toContain("[[TOKEN-Name-J]]");

    const count = replaceEngine.applyMappings(detection.occurrences, {
      "[[TOKEN-Name-J]]": "James"
    });

    expect(count).toBe(1);
    expect(document.body.textContent).toContain("James");
    expect(document.body.textContent).not.toContain("[[TOKEN-Name-J]]");
  });

  it("handles token spans split across adjacent text nodes", () => {
    const host = document.createElement("div");
    host.append(document.createTextNode("prefix [[TOKEN-"));
    host.append(document.createTextNode("Name-J]] suffix"));
    document.body.replaceChildren(host);

    const scanEngine = new ScanEngine(new DefaultTokenPatternProvider());
    const replaceEngine = new ReplaceEngine();

    const detection = scanEngine.scanRoots([document]);
    expect(detection.tokens).toEqual(["[[TOKEN-Name-J]]"]);

    replaceEngine.applyMappings(detection.occurrences, {
      "[[TOKEN-Name-J]]": "James"
    });

    expect(host.textContent).toBe("prefix James suffix");
  });

  it("detects tokens in input, textarea, shadow dom, and same-origin iframe", () => {
    document.body.innerHTML = `<input id="i" value="[[TOKEN-Name-J]]"><textarea id="t">[[TOKEN-Name-J]]</textarea>`;

    const contentEditable = document.createElement("div");
    contentEditable.setAttribute("contenteditable", "true");
    contentEditable.textContent = "[[TOKEN-Name-J]]";
    document.body.append(contentEditable);

    const shadowHost = document.createElement("div");
    const shadowRoot = shadowHost.attachShadow({ mode: "open" });
    shadowRoot.innerHTML = `<span>[[TOKEN-Name-J]]</span>`;
    document.body.append(shadowHost);

    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    iframe.contentDocument?.open();
    iframe.contentDocument?.write("<body>[[TOKEN-Name-J]]</body>");
    iframe.contentDocument?.close();

    const scanEngine = new ScanEngine(new DefaultTokenPatternProvider());
    const detection = scanEngine.scanRoots([document]);

    expect(detection.tokens.length).toBeGreaterThanOrEqual(1);
    expect(detection.occurrences.some((item) => item.targetType === "input")).toBe(true);
    expect(detection.occurrences.some((item) => item.targetType === "textarea")).toBe(true);
    expect(detection.occurrences.some((item) => item.targetType === "contenteditable")).toBe(true);
  });
});
