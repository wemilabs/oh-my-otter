import { test, expect } from "@playwright/test";
import { REPO_URL } from "../src/components/site/links";

test("contribute links to the proposal forms and starter issues", async ({
  page,
  baseURL,
}) => {
  await page.goto(`${baseURL}/contribute`);
  await expect(
    page.getByRole("link", { name: "Propose a check" }),
  ).toHaveAttribute("href", `${REPO_URL}/issues/new?template=new-check.yml`);
  await expect(
    page.getByRole("link", { name: "Propose a task" }),
  ).toHaveAttribute("href", `${REPO_URL}/issues/new?template=new-task.yml`);
  await expect(
    page.getByRole("link", { name: "Open a bug report" }),
  ).toHaveAttribute("href", `${REPO_URL}/issues/new?template=bug.yml`);
  await expect(
    page.getByRole("link", { name: "Read the step-by-step guide" }),
  ).toHaveAttribute("href", "/docs/run-a-benchmark");
  await expect(
    page.getByRole("link", { name: "Good first check issues" }),
  ).toHaveAttribute(
    "href",
    `${REPO_URL}/issues?q=is%3Aissue%20state%3Aopen%20label%3A%22good%20first%20check%22`,
  );
});
