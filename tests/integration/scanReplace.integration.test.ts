import { ReplaceEngine } from "../../extension/src/content/replaceEngine";
import { ScanEngine } from "../../extension/src/content/scanEngine";
import { filterDetectionForOutbound } from "../../extension/src/content/tokenSendPolicy";
import { DefaultTokenPatternProvider } from "../../extension/src/content/tokenPatternProvider";

describe("scan and replace integration", () => {
  it("detects and replaces tokens in text nodes", () => {
    const root = document.createElement("div");
    root.id = "root";
    root.textContent = "Employee: [<TOKEN-Name-J>]";
    document.body.replaceChildren(root);

    const scanEngine = new ScanEngine(new DefaultTokenPatternProvider());
    const replaceEngine = new ReplaceEngine();

    const detection = scanEngine.scanRoots([document]);
    expect(detection.tokens).toContain("[<TOKEN-Name-J>]");

    const count = replaceEngine.applyMappings(detection.occurrences, {
      "[<TOKEN-Name-J>]": "James"
    });

    expect(count).toBe(1);
    expect(document.body.textContent).toContain("James");
    expect(document.body.textContent).not.toContain("[<TOKEN-Name-J>]");
  });

  it("handles token spans split across adjacent text nodes", () => {
    const host = document.createElement("div");
    host.append(document.createTextNode("prefix [<TOKEN-"));
    host.append(document.createTextNode("Name-J>] suffix"));
    document.body.replaceChildren(host);

    const scanEngine = new ScanEngine(new DefaultTokenPatternProvider());
    const replaceEngine = new ReplaceEngine();

    const detection = scanEngine.scanRoots([document]);
    expect(detection.tokens).toEqual(["[<TOKEN-Name-J>]"]);

    replaceEngine.applyMappings(detection.occurrences, {
      "[<TOKEN-Name-J>]": "James"
    });

    expect(host.textContent).toBe("prefix James suffix");
  });

  it("detects tokens in input, textarea, contenteditable, and shadow dom", () => {
    document.body.innerHTML = `<input id="i" value="[<TOKEN-Name-J>]"><textarea id="t">[<TOKEN-Name-J>]</textarea>`;

    const contentEditable = document.createElement("div");
    contentEditable.setAttribute("contenteditable", "true");
    contentEditable.textContent = "[<TOKEN-Name-J>]";
    document.body.append(contentEditable);

    const shadowHost = document.createElement("div");
    const shadowRoot = shadowHost.attachShadow({ mode: "open" });
    shadowRoot.innerHTML = `<span>[<TOKEN-Name-J>]</span>`;
    document.body.append(shadowHost);

    const scanEngine = new ScanEngine(new DefaultTokenPatternProvider());
    const detection = scanEngine.scanRoots([document]);

    expect(detection.tokens.length).toBeGreaterThanOrEqual(1);
    expect(detection.occurrences.some((item) => item.targetType === "input")).toBe(true);
    expect(detection.occurrences.some((item) => item.targetType === "textarea")).toBe(true);
    expect(detection.occurrences.some((item) => item.targetType === "contenteditable")).toBe(true);
  });

  it("replaces tokens inside open shadow dom, including attribute surfaces", () => {
    const shadowHost = document.createElement("div");
    const shadowRoot = shadowHost.attachShadow({ mode: "open" });
    const shadowText = document.createElement("span");
    shadowText.textContent = "[<TOKEN-Name-J>]";
    shadowText.setAttribute("title", "Owner [<TOKEN-Name-M>]");
    shadowRoot.append(shadowText);

    document.body.replaceChildren(shadowHost);

    const scanEngine = new ScanEngine(new DefaultTokenPatternProvider());
    const replaceEngine = new ReplaceEngine();
    const detection = scanEngine.scanRoots([document]);

    expect(
      replaceEngine.applyMappings(detection.occurrences, {
        "[<TOKEN-Name-J>]": "James",
        "[<TOKEN-Name-M>]": "Marc"
      })
    ).toBe(2);

    expect(shadowRoot.textContent).toContain("James");
    expect(shadowText.getAttribute("title")).toBe("Owner Marc");
  });

  it("detects and replaces rich-text tokens split across formatted inline elements", () => {
    const host = document.createElement("div");
    const rich = document.createElement("p");
    rich.id = "rich";
    const start = document.createElement("span");
    start.textContent = "[<TOKEN-";
    const end = document.createElement("strong");
    end.textContent = "Name-J>]";
    rich.append(start, end);
    host.append(rich);
    document.body.replaceChildren(host);

    const scanEngine = new ScanEngine(new DefaultTokenPatternProvider());
    const replaceEngine = new ReplaceEngine();
    const detection = scanEngine.scanRoots([document]);

    expect(detection.tokens).toEqual(["[<TOKEN-Name-J>]"]);
    expect(
      replaceEngine.applyMappings(detection.occurrences, {
        "[<TOKEN-Name-J>]": "James"
      })
    ).toBe(1);
    expect(rich.textContent).toBe("James");
  });

  it("detects and replaces important visible attributes", () => {
    const input = document.createElement("input");
    input.setAttribute("placeholder", "Employee [<TOKEN-Name-J>]");
    const image = document.createElement("img");
    image.setAttribute("alt", "Badge [<TOKEN-Name-M>]");
    image.setAttribute("title", "Lead [<TOKEN-Name-E>]");
    const button = document.createElement("button");
    button.setAttribute("aria-label", "Open [<TOKEN-Name-JM>]");
    document.body.replaceChildren(input, image, button);

    const scanEngine = new ScanEngine(new DefaultTokenPatternProvider());
    const replaceEngine = new ReplaceEngine();
    const detection = scanEngine.scanRoots([document]);

    expect(detection.tokens).toEqual(
      expect.arrayContaining([
        "[<TOKEN-Name-J>]",
        "[<TOKEN-Name-M>]",
        "[<TOKEN-Name-E>]",
        "[<TOKEN-Name-JM>]"
      ])
    );
    expect(detection.occurrences.filter((item) => item.targetType === "attribute")).toHaveLength(4);

    expect(
      replaceEngine.applyMappings(detection.occurrences, {
        "[<TOKEN-Name-J>]": "James",
        "[<TOKEN-Name-M>]": "Marc",
        "[<TOKEN-Name-E>]": "Ed",
        "[<TOKEN-Name-JM>]": "Jay"
      })
    ).toBe(4);

    expect(input.getAttribute("placeholder")).toBe("Employee James");
    expect(image.getAttribute("alt")).toBe("Badge Marc");
    expect(image.getAttribute("title")).toBe("Lead Ed");
    expect(button.getAttribute("aria-label")).toBe("Open Jay");
  });

  it("only replaces approved tokens when mixed tokens are present", () => {
    const root = document.createElement("div");
    root.textContent = "[<TOKEN-Name-J>] [<TOKEN-Name-X>] [<TOKEN-Name-M>]";
    document.body.replaceChildren(root);

    const scanEngine = new ScanEngine(new DefaultTokenPatternProvider());
    const replaceEngine = new ReplaceEngine();
    const filtered = filterDetectionForOutbound(scanEngine.scanRoots([document]));

    expect(filtered.tokens).toEqual(["[<TOKEN-Name-J>]", "[<TOKEN-Name-M>]"]);

    replaceEngine.applyMappings(filtered.occurrences, {
      "[<TOKEN-Name-J>]": "James",
      "[<TOKEN-Name-M>]": "Marc",
      "[<TOKEN-Name-E>]": "Ed"
    });

    expect(document.body.textContent).toContain("James");
    expect(document.body.textContent).toContain("Marc");
    expect(document.body.textContent).toContain("[<TOKEN-Name-X>]");
  });

  it("does not scan script/style/noscript/template content", () => {
    const script = document.createElement("script");
    script.textContent = "const t='[<TOKEN-Name-J>]';";
    const style = document.createElement("style");
    style.textContent = ".x::before { content: '[<TOKEN-Name-M>]'; }";
    const noscript = document.createElement("noscript");
    noscript.textContent = "[<TOKEN-Name-E>]";
    const template = document.createElement("template");
    template.innerHTML = "<span>[<TOKEN-Name-J>]</span>";
    const visible = document.createElement("div");
    visible.textContent = "Visible [<TOKEN-Name-J>]";

    document.body.replaceChildren(script, style, noscript, template, visible);

    const scanEngine = new ScanEngine(new DefaultTokenPatternProvider());
    const detection = scanEngine.scanRoots([document]);

    expect(detection.tokens).toEqual(["[<TOKEN-Name-J>]"]);
  });

  it("does not treat CSS-generated text as in-scope DOM content", () => {
    const style = document.createElement("style");
    style.textContent = `.pii::before { content: '[<TOKEN-Name-J>]'; }`;
    const visible = document.createElement("div");
    visible.className = "pii";
    visible.setAttribute("title", "Tooltip [<TOKEN-Name-M>]");
    document.body.replaceChildren(style, visible);

    const scanEngine = new ScanEngine(new DefaultTokenPatternProvider());
    const detection = scanEngine.scanRoots([document]);

    expect(detection.tokens).toEqual(["[<TOKEN-Name-M>]"]);
  });

  it("avoids re-reporting unchanged content but rescans after mutations", () => {
    const host = document.createElement("div");
    host.textContent = "Visible [<TOKEN-Name-J>]";
    document.body.replaceChildren(host);

    const scanEngine = new ScanEngine(new DefaultTokenPatternProvider());

    const first = scanEngine.scanRoots([document]);
    const second = scanEngine.scanRoots([document]);

    expect(first.tokens).toEqual(["[<TOKEN-Name-J>]"]);
    expect(second.tokens).toEqual([]);

    host.textContent = "Visible [<TOKEN-Name-M>]";
    const third = scanEngine.scanRoots([document]);

    expect(third.tokens).toEqual(["[<TOKEN-Name-M>]"]);
  });

  it("ignores password fields and converts internal occurrences to public shapes", () => {
    const host = document.createElement("div");
    host.textContent = "Visible [<TOKEN-Name-J>]";
    const password = document.createElement("input");
    password.type = "password";
    password.value = "[<TOKEN-Name-M>]";
    document.body.replaceChildren(host, password);

    const scanEngine = new ScanEngine(new DefaultTokenPatternProvider());
    const detection = scanEngine.scanRoots([host.firstChild as Node, document]);

    expect(detection.tokens).toEqual(["[<TOKEN-Name-J>]"]);
    expect(scanEngine.toPublicOccurrences(detection.occurrences)).toEqual([
      expect.objectContaining({
        token: "[<TOKEN-Name-J>]",
        targetType: "text"
      })
    ]);
  });

  it("skips stale replacements when underlying content changed", () => {
    const host = document.createElement("div");
    host.textContent = "Visible [<TOKEN-Name-J>]";
    document.body.replaceChildren(host);

    const scanEngine = new ScanEngine(new DefaultTokenPatternProvider());
    const replaceEngine = new ReplaceEngine();
    const detection = scanEngine.scanRoots([document]);

    host.textContent = "Visible changed";

    expect(
      replaceEngine.applyMappings(detection.occurrences, {
        "[<TOKEN-Name-J>]": "James"
      })
    ).toBe(0);
    expect(host.textContent).toBe("Visible changed");
  });

  it("sanitizes replacement text and processes repeated matches back-to-front", () => {
    const host = document.createElement("div");
    host.textContent = "[<TOKEN-Name-J>] and [<TOKEN-Name-J>]";
    document.body.replaceChildren(host);

    const scanEngine = new ScanEngine(new DefaultTokenPatternProvider());
    const replaceEngine = new ReplaceEngine();
    const detection = scanEngine.scanRoots([document]);

    expect(
      replaceEngine.applyMappings(detection.occurrences, {
        "[<TOKEN-Name-J>]": "Ja\u0000mes"
      })
    ).toBe(2);
    expect(host.textContent).toBe("James and James");
  });
});
