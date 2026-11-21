import * as React from "react";
export type Native<T extends React.ElementType> = React.ComponentPropsWithoutRef<T>;
export type Content = React.ReactNode;
export type Element = React.ReactElement;
export type FieldProps = { id: string; label: string; hint?: Content; error?: string };
export type FieldControl = "input" | "textarea" | "select";
export type Field<T extends FieldControl> = FieldProps & Native<T>;
export type WithRef<P, T> = React.ForwardRefExoticComponent<P & React.RefAttributes<T>>;
export type Variant = "primary" | "secondary";
export const classes = (...values: (string | undefined)[]) => values.filter(Boolean).join(" ");


export type FieldLayoutProps = FieldProps & {
  required?: boolean;
  externalDescription?: string;
  render: (description?: string) => Content;
};
export function FieldLayout({ id, label, hint, error, required, externalDescription, render }: FieldLayoutProps): Element {
  const description = classes(externalDescription, hint ? id + "-hint" : undefined, error ? id + "-error" : undefined);
  return <div className="gp-field">
    <label htmlFor={id}>{label}{required && <span className="gp-muted"> (wymagane)</span>}</label>
    {hint && <div className="gp-muted" id={id + "-hint"}>{hint}</div>}
    {render(description || undefined)}
    {error && <span className="gp-error" id={id + "-error"}>Błąd: {error}</span>}
  </div>;
}


export type ChoiceProps = Omit<Native<"input">, "type" | "children"> & { label: Content };
export const Choice = React.forwardRef<HTMLInputElement, ChoiceProps & { type: "radio" | "checkbox" }>(
  ({ label, className, type, ...props }, ref) =>
    <label className="gp-choice"><input {...props} className={className} ref={ref} type={type} />
      <div>{label}{props.required && <span className="gp-muted"> (wymagane)</span>}</div></label>);

export type Crumb = { href: string; label: string };

export type NoticeType = "info" | "success" | "warning" | "error";
export const noticeTitles: Record<NoticeType, string> = {
  info: "Informacja", success: "Potwierdzenie", warning: "Uwaga", error: "Błąd"
};

export type TabItem = { key: string; label: string; content: Content };
