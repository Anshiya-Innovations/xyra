import { ChevronRight } from "@untitledui/icons";
import { useNavigate } from "react-router";

export type Crumb = { label: string; href?: string };

// ponytail: Untitled UI's own Breadcrumbs component is PRO-only (CLI add
// refused it) - this is just Button/text composed the same way every other
// page here already composes primitives, not a bespoke design. Starts with
// the page's own top-level section (Control Management, Reports, ...), not
// Dashboard - the sidebar's own grouping is the source of truth for that.
export const Breadcrumbs = ({ items }: { items: Crumb[] }) => {
    const navigate = useNavigate();

    return (
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm">
            {items.map((item, i) => {
                const isLast = i === items.length - 1;
                return (
                    <span key={`${item.label}-${i}`} className="flex items-center gap-1.5">
                        {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-fg-quaternary" aria-hidden="true" />}
                        {item.href && !isLast ? (
                            <button
                                type="button"
                                onClick={() => navigate(item.href!)}
                                className="cursor-pointer text-tertiary transition duration-100 ease-linear hover:text-tertiary_hover hover:underline"
                            >
                                {item.label}
                            </button>
                        ) : (
                            <span aria-current={isLast ? "page" : undefined} className={isLast ? "font-medium text-primary" : "text-tertiary"}>
                                {item.label}
                            </span>
                        )}
                    </span>
                );
            })}
        </nav>
    );
};
