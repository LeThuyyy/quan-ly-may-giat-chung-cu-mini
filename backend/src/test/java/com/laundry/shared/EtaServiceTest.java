package com.laundry.shared;
import org.junit.jupiter.api.Test;
import java.time.Instant;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
class EtaServiceTest {
    private final Instant now=Instant.parse("2026-11-25T00:00:00Z");
    @Test void deterministicParallelSimulationUsesOneSlotPerMachine() {
        var slots=List.of(new EtaService.Slot(now,now),new EtaService.Slot(now.plusSeconds(1200),now.plusSeconds(1200)));
        assertEquals(new EtaService.Slot(now,now),EtaService.simulate(slots,0));
        assertEquals(new EtaService.Slot(now.plusSeconds(1200),now.plusSeconds(1200)),EtaService.simulate(slots,1));
        assertEquals(new EtaService.Slot(now.plusSeconds(3000),now.plusSeconds(3300)),EtaService.simulate(slots,2));
        assertEquals(2,slots.size());
    }
    @Test void oneHeldSlotIsNotCountedTwice() {
        var slots=List.of(new EtaService.Slot(now.plusSeconds(3000),now.plusSeconds(3780)));
        assertEquals(new EtaService.Slot(now.plusSeconds(6000),now.plusSeconds(7080)),EtaService.simulate(slots,1));
        assertNull(EtaService.simulate(List.of(),5));
    }
}
