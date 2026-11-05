// Compatibility layer: the migrated pages were written against wouter's API.
// It is implemented on TanStack Router so the app keeps a single router.
import { Link as TLink, useLocation as useTLocation, useNavigate } from "@tanstack/react-router";
import { useCallback, type AnchorHTMLAttributes, type ReactNode } from "react";

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href?: string;
  to?: string;
  children?: ReactNode;
};

export function Link({ href, to, children, ...rest }: LinkProps) {
  const target = href ?? to ?? "/";
  if (/^(https?:|mailto:|tel:|#)/.test(target)) {
    return (
      <a href={target} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <TLink to={target as never} {...(rest as Record<string, unknown>)}>
      {children}
    </TLink>
  );
}

type NavigateOptions = { replace?: boolean; search?: Record<string, string> };

export function useLocation(): [string, (to: string, opts?: NavigateOptions) => void] {
  const pathname = useTLocation({ select: (l) => l.pathname });
  const navigate = useNavigate();
  const go = useCallback(
    (to: string, opts?: NavigateOptions) => {
      // Paths may carry a query string ("?job=12") so view state survives a
      // refresh; an explicit `search` (including `{}`) overrides it.
      const [path, query] = to.split("?");
      const search =
        opts?.search ??
        (query !== undefined ? Object.fromEntries(new URLSearchParams(query)) : undefined);
      void navigate({
        to: path as never,
        replace: opts?.replace,
        ...(search ? { search: search as never } : {}),
      } as never);
    },
    [navigate],
  );
  return [pathname, go];
}

export function useSearch(): string {
  const location = useTLocation();
  return location.searchStr?.replace(/^\?/, "") ?? "";
}
