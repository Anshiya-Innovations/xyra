import { BarChart03, Building05, CheckVerified01, File06, Home02, Key01, Lightbulb02, List, Settings01, Shield01 } from "@untitledui/icons";
import { Badge } from "@/components/base/badges/badges";
import type { NavItemType } from "@/components/application/app-navigation/config";

// Mirrors xyra-web's SAPUI5 sidebar (webapp/view/ControlManagement.view.xml
// and friends) so both frontends navigate the same set of sections.
export const NAV_ITEMS: NavItemType[] = [
    { label: "Admin Dashboard", href: "/dashboard", icon: Home02 },
    {
        label: "Control Management",
        icon: Shield01,
        items: [
            { label: "Controls Config", href: "/controls" },
            { label: "System Control Config", href: "/system-control-config" },
            { label: "Deviation Report", href: "/deviation-report" },
        ],
    },
    { label: "AI Insights", href: "/ai-insights", icon: Lightbulb02, badge: <Badge color="brand" size="sm">New</Badge> },
    { label: "SOX Compliance", href: "/sox-compliance", icon: CheckVerified01, badge: <Badge color="success" size="sm">98.4%</Badge> },
    { label: "Reports", href: "/reports", icon: File06 },
    { label: "Audit Logs", href: "/audit-logs", icon: List },
    { label: "System Configuration", href: "/configuration", icon: Settings01 },
    { label: "Access Management", href: "/access-management", icon: Key01 },
    { label: "Organization", href: "/organization", icon: Building05 },
    { label: "Risk Analytics", href: "/risk-analytics", icon: BarChart03, badge: <Badge color="warning" size="sm">3 Risks</Badge> },
];
