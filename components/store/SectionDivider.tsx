export function SectionDivider() {
  return (
    <div className="w-full flex justify-center">
      <div
        className="w-full max-w-7xl h-px"
        style={{
          background:
            "linear-gradient(to right, transparent, rgba(165,180,252,0.3), transparent)",
        }}
      />
    </div>
  );
}
