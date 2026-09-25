import { AlertTriangle, CheckCircle, XCircle } from "@untitledui/icons";
import { ToastQueue } from "react-stately";
import { UNSTABLE_Toast as AriaToast, UNSTABLE_ToastContent as AriaToastContent, UNSTABLE_ToastList as AriaToastList, UNSTABLE_ToastRegion as AriaToastRegion } from "react-aria-components";
import { cx } from "@/utils/cx";

type NotificationContent = { type: "success" | "error" | "warning"; message: string };

export const notificationQueue = new ToastQueue<NotificationContent>({ maxVisibleToasts: 3 });

export function notify(type: "success" | "error" | "warning", message: string) {
    notificationQueue.add({ type, message }, { timeout: 5000 });
}

// Mount once per page that calls notify() - a fixed-position stack of
// auto-dismissing toasts, built on react-aria-components' own (UNSTABLE)
// Toast primitives rather than a hand-rolled queue/portal/timer system.
export function NotificationRegion() {
    return (
        <AriaToastRegion queue={notificationQueue} className="fixed right-4 bottom-4 z-50 flex flex-col gap-2">
            <AriaToastList<NotificationContent> className="flex flex-col gap-2">
                {({ toast }) => (
                    <AriaToast
                        toast={toast}
                        className={cx(
                            "flex w-80 items-start gap-2 rounded-lg p-4 text-sm shadow-lg ring-1",
                            toast.content.type === "success" && "bg-success-secondary text-success-primary ring-success",
                            toast.content.type === "error" && "bg-error-secondary text-error-primary ring-error",
                            toast.content.type === "warning" && "bg-warning-secondary text-warning-primary ring-secondary",
                        )}
                    >
                        <AriaToastContent className="flex items-start gap-2">
                            {toast.content.type === "success" && <CheckCircle className="mt-0.5 size-5 shrink-0" />}
                            {toast.content.type === "error" && <XCircle className="mt-0.5 size-5 shrink-0" />}
                            {toast.content.type === "warning" && <AlertTriangle className="mt-0.5 size-5 shrink-0" />}
                            <span>{toast.content.message}</span>
                        </AriaToastContent>
                    </AriaToast>
                )}
            </AriaToastList>
        </AriaToastRegion>
    );
}
