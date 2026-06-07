import { Toaster as Sonner, type ToasterProps } from "sonner";

export function AppToaster(props: ToasterProps) {
  return (
    <Sonner
      position="top-center"
      toastOptions={{
        classNames: {
          toast:
            "glass !rounded-2xl !border !bg-white !bg-opacity-30 !border-border/60 !shadow-elegant !text-foreground !font-sans",
          title: "!font-semibold",
          description: "!text-muted-foreground",
        },
      }}
      {...props}
    />
  );
}
