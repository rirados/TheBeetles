import { Outlet, NavLink } from "react-router-dom";

export default function App() {
  return (
    <div className="h-full flex flex-col">
      <header className="bg-[#fffdf9] border-b border-[#e6dbca] px-4 py-2.5 flex items-center justify-between flex-shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#8ec5ff] to-[#f6c7b3] flex items-center justify-center text-[#274b63] text-lg font-bold">
            🌊
          </div>
          <div>
            <div className="text-base font-bold tracking-tight text-[#2f2a22]">
              Flood<span className="text-[#5b8fb8]">Guardian</span>
            </div>
            <div className="text-[10px] text-[#7d6f5f] -mt-0.5">
              Retro Emergency Response Console
            </div>
          </div>
        </div>
        <nav className="flex items-center gap-1">
          <NavLink
            to="/citizen"
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? "bg-[#f3e1c8] text-[#5b422f] border border-[#d9ba8f]"
                  : "text-[#7d6f5f] hover:text-[#5b422f] hover:bg-[#f7efe6]"
              }`
            }
          >
            Citizen
          </NavLink>
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? "bg-[#f3e1c8] text-[#5b422f] border border-[#d9ba8f]"
                  : "text-[#7d6f5f] hover:text-[#5b422f] hover:bg-[#f7efe6]"
              }`
            }
          >
            Admin Control Room
          </NavLink>
        </nav>
      </header>
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
