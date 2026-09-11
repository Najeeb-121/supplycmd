import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import SimulationsPage from "../../pages/simulations";

vi.mock("@/hooks/use-toast", () => ({
    useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/components/simulations/PortfolioSimulationTab", () => ({
    default: () => <div>Portfolio Simulation Test Stub</div>,
}));

function makeQC() {
    return new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
}

describe("Simulations page (SR-6 Phase 9)", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        global.fetch = vi.fn((input: RequestInfo | URL) => {
            const url = String(input);

            if (url === "/api/erp/suppliers") {
                return Promise.resolve({
                    ok: true,
                    json: async () => [
                        { id: 21, name: "Test Supplier" },
                    ],
                } as Response);
            }

            if (url === "/api/inventory") {
                return Promise.resolve({
                    ok: true,
                    json: async () => [
                        { id: 17, name: "Test Product" },
                    ],
                } as Response);
            }

            if (url === "/api/inventory/relationships") {
                return Promise.resolve({
                    ok: true,
                    json: async () => [
                        {
                            supplierId: 21,
                            productId: 17,
                            activePoCount: 1,
                            inboundQty: 100,
                        },
                    ],
                } as Response);
            }

            if (url === "/api/simulation/run") {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        result: {
                            simulationStatus: "NOT_EXECUTED",
                            errorCode: "TEST",
                            errorMessage: "Test result",
                        },
                        narration: "",
                    }),
                } as Response);
            }

            return Promise.reject(new Error(`Unhandled fetch: ${url}`));
        });
    });

    it("sends only demand-surge parameters for DEMAND_SURGE", async () => {
        const user = userEvent.setup();

        render(
            <QueryClientProvider client={makeQC()}>
                <SimulationsPage />
            </QueryClientProvider>
        );

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith("/api/inventory");
        });

        await user.click(screen.getByRole("combobox", { name: "Risk Category" }));
        await user.click(screen.getByText("Demand Risks"));

        await user.click(screen.getByRole("combobox", { name: "Target Product" }));
        await user.click(screen.getByText("Test Product"));

        await user.click(screen.getByRole("button", { name: "Run Simulation" }));

        const simulationCall = vi
            .mocked(global.fetch)
            .mock.calls.find(([url]) => String(url) === "/api/simulation/run");

        expect(simulationCall).toBeDefined();

        const requestInit = simulationCall?.[1] as RequestInit;
        const body = JSON.parse(String(requestInit.body));

        expect(body).toEqual({
            scenario: {
                type: "DEMAND_SURGE",
                parameters: {
                    productId: 17,
                    surgePct: 50,
                },
            },
        });
    }, 10000);

    it("sends only supplier and product parameters for SINGLE_SOURCE_FAILURE", async () => {
        const user = userEvent.setup();

        render(
            <QueryClientProvider client={makeQC()}>
                <SimulationsPage />
            </QueryClientProvider>
        );

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith("/api/inventory");
        });

        await user.click(screen.getByRole("combobox", { name: "Target Supplier" }));
        await user.click(screen.getByText("Test Supplier"));

        await user.click(screen.getByRole("combobox", { name: "Target Product" }));
        await user.click(screen.getByText("Test Product"));

        await user.click(screen.getByRole("combobox", { name: "Scenario Type" }));
        await user.click(screen.getByText("Single Source Failure"));

        await user.click(screen.getByRole("button", { name: "Run Simulation" }));

        const simulationCall = vi
            .mocked(global.fetch)
            .mock.calls.find(([url]) => String(url) === "/api/simulation/run");

        expect(simulationCall).toBeDefined();

        const requestInit = simulationCall?.[1] as RequestInit;
        const body = JSON.parse(String(requestInit.body));

        expect(body).toEqual({
            scenario: {
                type: "SINGLE_SOURCE_FAILURE",
                parameters: {
                    productId: 17,
                    supplierId: 21,
                },
            },
        });
    }, 10000);

    it("sends supplier price shock parameters for SUPPLIER_PRICE_SHOCK", async () => {
        const user = userEvent.setup();

        render(
            <QueryClientProvider client={makeQC()}>
                <SimulationsPage />
            </QueryClientProvider>
        );

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith("/api/inventory");
        });

        await user.click(
            screen.getByRole("combobox", { name: "Target Supplier" })
        );
        await user.click(screen.getByText("Test Supplier"));

        await user.click(
            screen.getByRole("combobox", { name: "Target Product" })
        );
        await user.click(screen.getByText("Test Product"));

        await user.click(
            screen.getByRole("combobox", { name: "Scenario Type" })
        );
        await user.click(screen.getByText("Supplier Price Shock"));

        await user.click(
            screen.getByRole("button", { name: "Run Simulation" })
        );

        const simulationCall = vi
            .mocked(global.fetch)
            .mock.calls.find(([url]) => String(url) === "/api/simulation/run");

        expect(simulationCall).toBeDefined();

        const requestInit = simulationCall?.[1] as RequestInit;
        const body = JSON.parse(String(requestInit.body));

        expect(body).toEqual({
            scenario: {
                type: "SUPPLIER_PRICE_SHOCK",
                parameters: {
                    productId: 17,
                    supplierId: 21,
                    shockPct: 10,
                },
            },
        });
    }, 10000);

    it("sends demand collapse parameters for DEMAND_COLLAPSE", async () => {
        const user = userEvent.setup();

        render(
            <QueryClientProvider client={makeQC()}>
                <SimulationsPage />
            </QueryClientProvider>
        );

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith("/api/inventory");
        });

        await user.click(
            screen.getByRole("combobox", { name: "Risk Category" })
        );
        await user.click(screen.getByText("Demand Risks"));

        await user.click(
            screen.getByRole("combobox", { name: "Target Product" })
        );
        await user.click(screen.getByText("Test Product"));

        await user.click(
            screen.getByRole("combobox", { name: "Scenario Type" })
        );
        await user.click(screen.getByText("Demand Collapse"));

        await user.click(
            screen.getByRole("button", { name: "Run Simulation" })
        );

        const simulationCall = vi
            .mocked(global.fetch)
            .mock.calls.find(([url]) => String(url) === "/api/simulation/run");

        expect(simulationCall).toBeDefined();

        const requestInit = simulationCall?.[1] as RequestInit;
        const body = JSON.parse(String(requestInit.body));

        expect(body).toEqual({
            scenario: {
                type: "DEMAND_COLLAPSE",
                parameters: {
                    productId: 17,
                    collapsePct: 25,
                },
            },
        });
    }, 10000);

    it("sends seasonality shock parameters for SEASONALITY_SHOCK", async () => {
        const user = userEvent.setup();

        render(
            <QueryClientProvider client={makeQC()}>
                <SimulationsPage />
            </QueryClientProvider>
        );

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith("/api/inventory");
        });

        await user.click(
            screen.getByRole("combobox", { name: "Risk Category" })
        );
        await user.click(screen.getByText("Demand Risks"));

        await user.click(
            screen.getByRole("combobox", { name: "Target Product" })
        );
        await user.click(screen.getByText("Test Product"));

        await user.click(
            screen.getByRole("combobox", { name: "Scenario Type" })
        );
        await user.click(screen.getByText("Seasonality Shock"));

        await user.click(
            screen.getByRole("button", { name: "Run Simulation" })
        );

        const simulationCall = vi
            .mocked(global.fetch)
            .mock.calls.find(([url]) => String(url) === "/api/simulation/run");

        expect(simulationCall).toBeDefined();

        const requestInit = simulationCall?.[1] as RequestInit;
        const body = JSON.parse(String(requestInit.body));

        expect(body).toEqual({
            scenario: {
                type: "SEASONALITY_SHOCK",
                parameters: {
                    productId: 17,
                    peakMultiplier: 1.25,
                    troughMultiplier: 0.75,
                },
            },
        });
    }, 10000);

    it("sends production line failure parameters for PRODUCTION_LINE_FAILURE", async () => {
        const user = userEvent.setup();

        vi.mocked(global.fetch).mockImplementation((input: RequestInfo | URL) => {
            const url = String(input);

            if (url === "/api/erp/suppliers") {
                return Promise.resolve({
                    ok: true,
                    json: async () => [
                        { id: 21, name: "Test Supplier" },
                    ],
                } as Response);
            }

            if (url === "/api/inventory") {
                return Promise.resolve({
                    ok: true,
                    json: async () => [
                        { id: 17, name: "Test Product" },
                    ],
                } as Response);
            }

            if (url === "/api/inventory/relationships") {
                return Promise.resolve({
                    ok: true,
                    json: async () => [],
                } as Response);
            }

            if (url === "/api/production/workcenters?productId=17") {
                return Promise.resolve({
                    ok: true,
                    json: async () => [
                        { id: 9, label: "Work Center 9" },
                    ],
                } as Response);
            }

            if (url === "/api/simulation/run") {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        result: {
                            simulationStatus: "NOT_EXECUTED",
                            errorCode: "TEST",
                            errorMessage: "Test result",
                        },
                        narration: "",
                    }),
                } as Response);
            }

            return Promise.reject(new Error(`Unhandled fetch: ${url}`));
        });

        render(
            <QueryClientProvider client={makeQC()}>
                <SimulationsPage />
            </QueryClientProvider>
        );

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith("/api/inventory");
        });

        await user.click(
            screen.getByRole("combobox", { name: "Risk Category" })
        );
        await user.click(screen.getByText("Production Risks"));

        await user.click(
            screen.getByRole("combobox", { name: "Target Product" })
        );
        await user.click(screen.getByText("Test Product"));

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                "/api/production/workcenters?productId=17"
            );
        });

        await user.click(
            screen.getByRole("combobox", { name: "Production Line" })
        );
        await user.click(screen.getByText("Work Center 9"));

        await user.click(
            screen.getByRole("button", { name: "Run Simulation" })
        );

        const simulationCall = vi
            .mocked(global.fetch)
            .mock.calls.find(([url]) => String(url) === "/api/simulation/run");

        expect(simulationCall).toBeDefined();

        const requestInit = simulationCall?.[1] as RequestInit;
        const body = JSON.parse(String(requestInit.body));

        expect(body).toEqual({
            scenario: {
                type: "PRODUCTION_LINE_FAILURE",
                parameters: {
                    productId: 17,
                    lineId: 9,
                    downtimeDays: 1,
                },
            },
        });
    }, 10000);

});
