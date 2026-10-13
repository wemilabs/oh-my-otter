import "server-only";
import { buildCheckCatalog } from "./checks";

export async function getCheckCatalog() {
  "use cache";
  return buildCheckCatalog();
}
