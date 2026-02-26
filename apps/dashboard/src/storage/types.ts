export interface PageView {
    event: string        // ex: "hospitalar", "autocom", "showsafra"
    src: string          // ex: "rd", "google", "direct"
    timestamp: string    // ISO 8601
    userAgent?: string
}

export interface Lead {
    event: string      // "hospitalar" | "autocom" | "showsafra" | "expo_otica"
    src: string        // "rd" | "direct" | ...
    timestamp: string  // ISO 8601
    name?: string      // Opcional na Opção A
    email?: string     // Opcional na Opção A
    company?: string   // Opcional na Opção A
    phone?: string
    message?: string
}

export interface CampaignMetrics {
    event: string
    pageViews: number
    leads: number
    lastView?: string
}

export interface StorageAdapter {
    trackPageView(data: PageView): Promise<void>
    saveLead(data: Lead): Promise<void>
    getPageViewsByEvent(event: string): Promise<number>
    getAllMetrics(): Promise<CampaignMetrics[]>
}
