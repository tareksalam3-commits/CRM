export default function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] animate-in fade-in duration-500">
      <div className="relative">
        {/* Outer Ring */}
        <div className="w-16 h-16 rounded-full border-[6px] border-primary/10"></div>
        {/* Spinning Ring */}
        <div className="absolute top-0 left-0 w-16 h-16 rounded-full border-[6px] border-transparent border-t-primary animate-spin"></div>
        {/* Inner Pulse */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-primary rounded-full animate-pulse"></div>
      </div>
      <p className="mt-6 text-sm font-black text-slate-400 uppercase tracking-widest animate-pulse">
        جاري تحميل البيانات...
      </p>
    </div>
  );
}
