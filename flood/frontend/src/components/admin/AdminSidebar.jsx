import ReportsPanel from "./ReportsPanel";
import VehiclesPanel from "./VehiclesPanel";
import AlertsPanel from "./AlertsPanel";
import RoutePlannerPanel from "./RoutePlannerPanel";

const TABS = [
  { id: "router", label: "Router", icon: "" },
  { id: "vehicles", label: "Vehicles", icon: "" },
  { id: "reports", label: "Reports", icon: "" },
  { id: "alerts", label: "Alerts", icon: "" },
];

export default function AdminSidebar({
  activeTab,
  setActiveTab,
  reports,
  incidents,
  vehicles,
  alerts,
  onDispatch,
  onResolve,
  onCreateIncident,
  onCreateAlert,
  onClearAlert,
  // Route Planner props
  routePlannerOrigin,
  routePlannerDestination,
  plannedRoutes,
  routePlanning,
  routePlanError,
  selectedRouteIdx,
  pickMode,
  onRoutePlannerOriginChange,
  onRoutePlannerDestinationChange,
  onPlanRoutes,
  onSelectRoute,
  onPickModeChange,
  // Simulation props
  simulating,
  simProgress,
  onStartSimulation,
  onStopSimulation,
  floodMarkers,
  simStatus,
}) {
  return (
    <div className="bg-[#fffdf9] border-l border-[#e6dbca] flex flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-[#e6dbca] flex-shrink-0 overflow-x-auto bg-[#fcfbf7]">
        {TABS.map((t) => {
          const count =
            t.id === "vehicles"
              ? vehicles.length
              : t.id === "reports"
              ? reports.length
              : t.id === "alerts"
              ? alerts.length
              : null;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex-1 min-w-[60px] px-2 py-2.5 text-xs font-medium border-b-2 transition-colors flex flex-col items-center gap-0.5 ${
                activeTab === t.id
                  ? "border-[#7fb8e6] text-[#274b63] bg-[#eef7ff]"
                  : "border-transparent text-[#7d6f5f] hover:text-[#274b63] hover:bg-[#f7efe6]"
              }`}
            >
              <span className="text-base">{t.icon}</span>
              <span className="flex items-center gap-1">
                {t.label}
                {count != null && count > 0 && (
                  <span className="bg-[#f3eadf] text-[9px] px-1 rounded text-[#6b4f2f]">
                    {count}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "router" && (
          <RoutePlannerPanel
            origin={routePlannerOrigin}
            destination={routePlannerDestination}
            plannedRoutes={plannedRoutes}
            planning={routePlanning}
            planError={routePlanError}
            selectedRouteIdx={selectedRouteIdx}
            onOriginChange={onRoutePlannerOriginChange}
            onDestinationChange={onRoutePlannerDestinationChange}
            onPlan={onPlanRoutes}
            onSelectRoute={onSelectRoute}
            onPickModeChange={onPickModeChange}
            pickMode={pickMode}
            vehicles={vehicles}
            simulating={simulating}
            simProgress={simProgress}
            onStartSimulation={onStartSimulation}
            onStopSimulation={onStopSimulation}
            floodMarkers={floodMarkers}
            simStatus={simStatus}
          />
        )}
        {activeTab === "vehicles" && <VehiclesPanel vehicles={vehicles} />}
        {activeTab === "reports" && <ReportsPanel reports={reports} />}
        {activeTab === "alerts" && (
          <AlertsPanel
            alerts={alerts}
            onCreateAlert={onCreateAlert}
            onClearAlert={onClearAlert}
          />
        )}
      </div>
    </div>
  );
}
