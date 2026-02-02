import EntityCard from "./EntityCard";
import TableEmpty from "./TableEmpty";
import { buildCardCellsFromColumns } from "./cardUtils";

const getItemKey = (item, index) => {
  if (!item) return index;
  return item.id ?? item.reference ?? item.title ?? item.name ?? index;
};

export default function EntityGrid({
  data = [],
  columns = [],
  onRowClick,
  getItemEmphasis,
  emptyMessage = null,
  className = "",
  containerRef = null, // Ref for measuring container dimensions
}) {
  if (!data.length) {
    return (
      <div className={`px-4 lg:px-6 py-6 ${className}`}>
        <TableEmpty message={emptyMessage} />
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`px-4 lg:px-6 py-6 ${className}`}>
      <div className="grid gap-4 lg:gap-5 xl:gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))' }}>
        {data.map((item, index) => {
          const cells = buildCardCellsFromColumns(columns, item);
          const emphasis = getItemEmphasis ? getItemEmphasis(item) : "normal";
          return (
            <EntityCard
              key={getItemKey(item, index)}
              cells={cells}
              emphasis={emphasis}
              onClick={
                onRowClick
                  ? () => {
                    onRowClick(item);
                  }
                  : undefined
              }
            />
          );
        })}
      </div>
    </div>
  );
}
