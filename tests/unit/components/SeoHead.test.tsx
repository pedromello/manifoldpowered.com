import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { HeadManagerContext } from "next/dist/shared/lib/head-manager-context.shared-runtime";

import { SeoHead } from "components/SeoHead";

function collectHead(privatePage: boolean) {
  let head: ReactElement[] = [];

  renderToStaticMarkup(
    <HeadManagerContext.Provider
      value={
        {
          mountedInstances: new Set(),
          updateHead: (nextHead: ReactElement[]) => {
            head = nextHead;
          },
        } as never
      }
    >
      <SeoHead
        locale="en"
        path="/store/working-draft"
        title="Working draft"
        description="Private working draft"
        image="https://www.manifoldpowered.com/api/og/outlet/working-draft"
        imageAlt="Draft artwork"
        jsonLd={{ "@type": "Store" }}
        privatePage={privatePage}
      />
    </HeadManagerContext.Provider>,
  );

  return head;
}

describe("SeoHead private projection", () => {
  test("omits canonical, social metadata and JSON-LD for a draft preview", () => {
    const head = collectHead(true);

    expect(head.some((node) => node.props.rel === "canonical")).toBe(false);
    expect(head.some((node) => node.props.property?.startsWith("og:"))).toBe(
      false,
    );
    expect(head.some((node) => node.props.name?.startsWith("twitter:"))).toBe(
      false,
    );
    expect(head.some((node) => node.props.type === "application/ld+json")).toBe(
      false,
    );
  });

  test("keeps public social metadata unchanged", () => {
    const head = collectHead(false);

    expect(head.some((node) => node.props.rel === "canonical")).toBe(true);
    expect(head.some((node) => node.props.property === "og:image")).toBe(true);
    expect(head.some((node) => node.props.name === "twitter:image")).toBe(true);
    expect(head.some((node) => node.props.type === "application/ld+json")).toBe(
      true,
    );
  });
});
