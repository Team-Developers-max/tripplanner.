// Indian Railways station codes. A city can have multiple terminals serving
// different directions — e.g. Mumbai has MMCT (west), CSMT (south/east), LTT
// (long-distance). We query all of them and merge.
export const STATION_CODES = {
  mumbai:       ["MMCT", "CSMT", "LTT", "DR"],   // Central / CST / Lokmanya Tilak / Dadar
  delhi:        ["NDLS", "DLI", "NZM", "ANVT"],  // New Delhi / Old Delhi / Nizamuddin / Anand Vihar
  "new delhi":  ["NDLS", "DLI", "NZM", "ANVT"],
  jaipur:       "JP",
  bangalore:    ["SBC", "YPR"],  // KSR Bengaluru / Yesvantpur
  bengaluru:    ["SBC", "YPR"],
  chennai:      ["MAS", "MS"],   // MGR Central / Egmore
  hyderabad:    ["SC", "HYB", "KCG"], // Secunderabad / Hyderabad Deccan / Kacheguda
  kolkata:      ["HWH", "SDAH", "KOAA"], // Howrah / Sealdah / Kolkata
  pune:         "PUNE",
  ahmedabad:    "ADI",
  lucknow:      ["LKO", "LJN"],  // Charbagh / Junction
  goa:          ["MAO", "KRMI"], // Madgaon / Karmali
  agra:         ["AGC", "AGA"],  // Agra Cantt / Agra Fort
  varanasi:     ["BSB", "BSBS"], // Varanasi Junction / City
  udaipur:      "UDZ",
  jodhpur:      "JU",
  chandigarh:   "CDG",
  kochi:        ["ERS", "ERN"],  // Ernakulam Junction / Town
  mysore:       "MYS",
};

export function codesFor(city) {
  if (!city) return [];
  const v = STATION_CODES[city.trim().toLowerCase()];
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}
