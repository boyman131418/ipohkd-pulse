import {
  Outlet,
  Link,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import appCss from "../styles.css?url";

interface RouterContext {
  queryClient: QueryClient;
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "IPOHKD — 香港IPO情報站" },
      {
        name: "description",
        content: "追蹤香港新股IPO：發行價、首日升跌、現價、入場費，過去一年同即將上市一覽。",
      },
      { name: "author", content: "IPOHKD" },
      { property: "og:title", content: "IPOHKD — 香港IPO情報站" },
      {
        property: "og:description",
        content: "香港IPO即時情報：發行價、首日升跌、現價、入場費、統計圖。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "IPOHKD — 香港IPO情報站" },
      { name: "description", content: "IPO Insights HK provides comprehensive Hong Kong IPO data, past and present." },
      { property: "og:description", content: "IPO Insights HK provides comprehensive Hong Kong IPO data, past and present." },
      { name: "twitter:description", content: "IPO Insights HK provides comprehensive Hong Kong IPO data, past and present." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/77bbd0bc-76c9-4cf1-bab0-292412dabcac/id-preview-2b25371a--c1940b38-5c5c-417e-9f56-5cdb29d3b830.lovable.app-1777358827427.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/77bbd0bc-76c9-4cf1-bab0-292412dabcac/id-preview-2b25371a--c1940b38-5c5c-417e-9f56-5cdb29d3b830.lovable.app-1777358827427.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}
