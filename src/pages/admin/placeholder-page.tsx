import { Tool01 } from "@untitledui/icons";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import { Breadcrumbs } from "@/components/application/breadcrumbs/breadcrumbs";

// Reused for every nav section that's routed but not built out yet - keeps
// the sidebar fully clickable instead of 404ing on sections still to come.
// All of these are flat, top-level sidebar items (only "Control Management"
// nests sub-pages - see nav-items.tsx), so the trail is always one level deep.
export const PlaceholderPage = ({ title }: { title: string }) => {
    return (
        <div className="flex flex-col gap-6">
            <Breadcrumbs items={[{ label: title }]} />
            <div className="flex min-h-[60vh] items-center justify-center">
                <EmptyState size="md">
                    <EmptyState.Header>
                        <EmptyState.FeaturedIcon icon={Tool01} color="brand" theme="light" />
                    </EmptyState.Header>
                    <EmptyState.Content>
                        <EmptyState.Title>{title}</EmptyState.Title>
                        <EmptyState.Description>This section is coming soon.</EmptyState.Description>
                    </EmptyState.Content>
                </EmptyState>
            </div>
        </div>
    );
};
