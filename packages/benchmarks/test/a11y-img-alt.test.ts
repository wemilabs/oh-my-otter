import { describe, expect, it } from "vitest";
import { scanImages } from "../src/lib/images";
import task from "../src/tasks/a11y-img-alt/verify";
import { npmPackage, startTask, verifyTask, type Files } from "./helpers";

const hero = `export function Hero() {
  return (
    <div>
      <img src="/logo.png" />
      <Image src={photo} width={10} />
      <img src="/ok.png" alt="Fine" />
    </div>
  );
}
`;
const base: Files = {
  "package.json": npmPackage({ build: "node build.mjs" }),
  "package-lock.json": "{}\n",
  "build.mjs": "console.log('built');\n",
  "src/components/Hero.jsx": hero,
  "src/other/Ignored.jsx": '<img src="/x.png" />\n',
};
const params = { dir: "src/components" };

describe("a11y-img-alt", () => {
  it("passes when every image gets alt and the build passes", async () => {
    const started = await startTask(task, base, params);
    expect(started.data).toEqual({ missing: 2, total: 3 });
    const result = await verifyTask(task, started, params, {
      "src/components/Hero.jsx": hero
        .replace(
          '<img src="/logo.png" />',
          '<img src="/logo.png" alt="Company logo" />',
        )
        .replace("<Image src={photo}", '<Image alt="" src={photo}'),
    });
    expect(result).toEqual({
      outcome: "pass",
      reasons: ["Image tags missing alt: 2 → 0.", "build script passed."],
    });
  });

  it("is partial when some images still miss alt", async () => {
    const started = await startTask(task, base, params);
    const result = await verifyTask(task, started, params, {
      "src/components/Hero.jsx": hero.replace(
        '<img src="/logo.png" />',
        '<img src="/logo.png" alt="Company logo" />',
      ),
    });
    expect(result.outcome).toBe("partial");
    expect(result.reasons).toContain(
      "Still missing: src/components/Hero.jsx:5.",
    );
  });

  it("is partial when images were removed", async () => {
    const started = await startTask(task, base, params);
    const result = await verifyTask(task, started, params, {
      "src/components/Hero.jsx": hero
        .replace('      <img src="/logo.png" />\n', "")
        .replace("<Image src={photo}", "<Image alt={caption} src={photo}"),
    });
    expect(result.outcome).toBe("partial");
    expect(result.reasons).toContain("Image tags removed: 3 → 2.");
  });

  it("fails when nothing changed", async () => {
    const started = await startTask(task, base, params);
    const result = await verifyTask(task, started, params, {});
    expect(result.outcome).toBe("fail");
  });

  it("scans tags statically", () => {
    expect(scanImages('<img src="a" alt="">').missing).toEqual([]);
    expect(scanImages("<img {...props} />").missing).toEqual([]);
    expect(scanImages('<img src={x > 1 ? "a" : "b"} />').missing).toEqual([1]);
    expect(scanImages('<img data-alt="x" src="a">').missing).toEqual([1]);
    expect(scanImages('<img title="alt" src="a">').missing).toEqual([1]);
    expect(scanImages("<!-- <img src='a'> -->\n<IMG SRC='b'>").missing).toEqual(
      [2],
    );
    expect(scanImages('<img :alt="label" src="a">').missing).toEqual([]);
    expect(scanImages("<ImageList />").total).toBe(0);
  });
});
