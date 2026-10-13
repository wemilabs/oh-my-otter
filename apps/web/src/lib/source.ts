import { loader } from "fumadocs-core/source";
import { defineDocs } from "fumadocs-mdx/macro";

const docs = defineDocs({ dir: "../../docs" });

export const source = loader(
  { docs: docs.toFumadocsSource() },
  { baseUrl: "/docs" },
);
