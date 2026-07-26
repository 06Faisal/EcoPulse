/**
 * CO₂ Equivalents — converts kg CO₂ into human-relatable metaphors.
 * Sources: EPA GHG Equivalencies Calculator, IEA 2023 data.
 */

export interface CO2Equivalent {
    /** Font Awesome class, e.g. "fa-tree" */
    icon: string;
    label: string;
    value: string;
    detail: string;
}

// ─── Reference constants ────────────────────────────────────────────────────

/** kg CO₂ absorbed per tree per year (USDA avg) */
const KG_PER_TREE_PER_YEAR = 21.77;

/** kg CO₂ per smartphone full charge (avg 0.012 kWh × 0.45 kg/kWh) */
const KG_PER_PHONE_CHARGE = 0.0054;

/** kg CO₂ per km driven by petrol car (avg India, MoEFCC) */
const KG_PER_CAR_KM = 0.19;

/** kg CO₂ per km of economy flight (passenger, ICAO avg) */
const KG_PER_FLIGHT_KM = 0.255;

/** Mumbai–Delhi flight distance (km) */
const MUMBAI_DELHI_KM = 1148;

/** kg CO₂ to boil a kettle once */
const KG_PER_KETTLE = 0.027;

/** kg CO₂ per LED bulb hour (at Indian grid avg 0.45 kg/kWh × 0.009 kWh) */
const KG_PER_LED_HOUR = 0.00405;

// ─── Main converter ─────────────────────────────────────────────────────────

export function getCO2Equivalents(kgCO2: number): CO2Equivalent[] {
    if (kgCO2 <= 0) return [];

    const equivalents: CO2Equivalent[] = [];

    // Trees for a day
    const treeDays = (kgCO2 / KG_PER_TREE_PER_YEAR) * 365;
    if (treeDays < 1) {
        const treePct = ((kgCO2 / KG_PER_TREE_PER_YEAR) * 100).toFixed(1);
        equivalents.push({
            icon: 'fa-tree',
            label: 'Tree absorption',
            value: `${treePct}%`,
            detail: `of what one tree absorbs in a year`,
        });
    } else {
        equivalents.push({
            icon: 'fa-tree',
            label: 'Trees offset',
            value: treeDays >= 365 ? `${(treeDays / 365).toFixed(1)} tree-years` : `${treeDays.toFixed(0)} tree-days`,
            detail: `of CO₂ absorbed by trees`,
        });
    }

    // Phone charges
    const phoneCharges = Math.round(kgCO2 / KG_PER_PHONE_CHARGE);
    equivalents.push({
        icon: 'fa-mobile-screen',
        label: 'Phone charges',
        value: phoneCharges >= 1000
            ? `${(phoneCharges / 1000).toFixed(1)}k charges`
            : `${phoneCharges} charges`,
        detail: `equivalent smartphone full charges`,
    });

    // Car km equivalent
    const carKm = kgCO2 / KG_PER_CAR_KM;
    if (carKm < 1000) {
        equivalents.push({
            icon: 'fa-car-side',
            label: 'Car km',
            value: `${carKm.toFixed(1)} km`,
            detail: `driven in a petrol car`,
        });
    }

    // Flight % equivalent
    const flightPct = ((kgCO2 / (MUMBAI_DELHI_KM * KG_PER_FLIGHT_KM)) * 100).toFixed(1);
    equivalents.push({
        icon: 'fa-plane-up',
        label: 'MUM–DEL flight',
        value: `${flightPct}%`,
        detail: `of a Mumbai→Delhi flight`,
    });

    // LED bulb hours
    const ledHours = Math.round(kgCO2 / KG_PER_LED_HOUR);
    if (ledHours < 10000) {
        equivalents.push({
            icon: 'fa-lightbulb',
            label: 'LED hours',
            value: ledHours >= 1000 ? `${(ledHours / 1000).toFixed(1)}k hrs` : `${ledHours} hrs`,
            detail: `of a 9W LED bulb`,
        });
    }

    // Kettles boiled
    const kettles = Math.round(kgCO2 / KG_PER_KETTLE);
    if (kettles > 0 && kettles < 1000) {
        equivalents.push({
            icon: 'fa-mug-hot',
            label: 'Kettles boiled',
            value: `${kettles}`,
            detail: `full kettle boils`,
        });
    }

    // Return the most relevant 3
    return equivalents.slice(0, 3);
}

