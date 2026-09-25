import type { HTMLAttributes } from "react";
import { cx } from "@/utils/cx";
import xyraLogo from "@/assets/xyra-logo.png";
import xyraLogoDark from "@/assets/xyra-logo-dark.png";
import xyraMark from "@/assets/xyra-mark.png";

// Full wordmark, colored for dark surfaces (e.g. the sidebar).
export const XyraLogoDark = (props: HTMLAttributes<HTMLImageElement>) => (
    <img src={xyraLogoDark} alt="Xyra" {...props} className={cx("h-8 w-auto object-contain", props.className)} />
);

// Full wordmark, colored for light surfaces (e.g. the header bar).
export const XyraLogo = (props: HTMLAttributes<HTMLImageElement>) => (
    <img src={xyraLogo} alt="Xyra" {...props} className={cx("h-8 w-auto object-contain", props.className)} />
);

// Icon-only mark, no wordmark (e.g. the login page).
export const XyraMark = (props: HTMLAttributes<HTMLImageElement>) => (
    <img src={xyraMark} alt="Xyra" {...props} className={cx("h-8 w-auto object-contain", props.className)} />
);
