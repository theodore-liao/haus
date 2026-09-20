export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="page-title">
      <h1>{title}</h1>
      {actions ? <div>{actions}</div> : null}
      {description ? <p>{description}</p> : null}
    </div>
  );
}
