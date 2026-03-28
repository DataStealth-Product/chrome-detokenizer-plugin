import { rewriteOfficeXml, scanOfficeXml } from "../../extension/src/offscreen/officeXmlProcessor";

describe("office xml processor", () => {
  it("detects and rewrites split DOCX text runs", () => {
    const xml = `
      <w:document xmlns:w="urn:test">
        <w:body>
          <w:p>
            <w:r><w:t>[&lt;TOKEN-</w:t></w:r>
            <w:r><w:t>Name-J&gt;]</w:t></w:r>
          </w:p>
        </w:body>
      </w:document>
    `;

    expect(scanOfficeXml(xml, "docx").tokens).toEqual(["[<TOKEN-Name-J>]"]);

    const rewritten = rewriteOfficeXml(xml, "docx", {
      "[<TOKEN-Name-J>]": "James"
    });

    expect(rewritten.xml).toContain(">James<");
    expect(rewritten.xml).not.toContain("TOKEN-Name-J");
  });

  it("rewrites PPTX text nodes and tokenized attributes", () => {
    const xml = `
      <p:sld xmlns:p="urn:test" xmlns:a="urn:a">
        <p:cSld name="[&lt;TOKEN-Name-M&gt;]">
          <p:spTree>
            <p:sp>
              <p:txBody>
                <a:p>
                  <a:r><a:t>[&lt;TOKEN-Name-J&gt;]</a:t></a:r>
                </a:p>
              </p:txBody>
            </p:sp>
          </p:spTree>
        </p:cSld>
      </p:sld>
    `;

    const rewritten = rewriteOfficeXml(xml, "pptx", {
      "[<TOKEN-Name-J>]": "James",
      "[<TOKEN-Name-M>]": "Marc"
    });

    expect(rewritten.tokens).toEqual(["[<TOKEN-Name-M>]", "[<TOKEN-Name-J>]"]);
    expect(rewritten.xml).toContain("Marc");
    expect(rewritten.xml).toContain("James");
  });

  it("rewrites XLSX shared string content", () => {
    const xml = `
      <sst xmlns="urn:test">
        <si>
          <r><t>[&lt;TOKEN-</t></r>
          <r><t>Name-E&gt;]</t></r>
        </si>
      </sst>
    `;

    const rewritten = rewriteOfficeXml(xml, "xlsx", {
      "[<TOKEN-Name-E>]": "Ed"
    });

    expect(rewritten.tokens).toEqual(["[<TOKEN-Name-E>]"]);
    expect(rewritten.xml).toContain(">Ed<");
  });
});
