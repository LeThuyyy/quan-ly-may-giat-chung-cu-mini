package com.laundry.shared;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.Authentication;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.servlet.http.HttpServletResponse;
import java.util.UUID;

@RestController
@RequestMapping("/api/buildings/{id}/swaps")
public class QueueSwapController{
    private final QueueSwapService swaps;
    public QueueSwapController(QueueSwapService swaps){this.swaps=swaps;}
    @GetMapping public PageView<QueueSwapService.SwapView> list(Authentication auth,@PathVariable UUID id,
        @RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="20")int size,HttpServletResponse response){
        response.setHeader("Cache-Control","private, no-store");return swaps.list(auth.getName(),id,page,size);
    }
    @GetMapping("/pending") public PageView<QueueSwapService.SwapView> pending(Authentication auth,@PathVariable UUID id,
        @RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="20")int size,HttpServletResponse response){
        response.setHeader("Cache-Control","private, no-store");return swaps.pending(auth.getName(),id,page,size);
    }
    @GetMapping("/outgoing") public java.util.List<QueueSwapService.SwapView> outgoing(Authentication auth,@PathVariable UUID id,HttpServletResponse response){
        response.setHeader("Cache-Control","private, no-store");return swaps.outgoing(auth.getName(),id);
    }
    public record Create(@NotNull UUID recipientEntryId){}
    @PostMapping public QueueSwapService.SwapView create(Authentication auth,@PathVariable UUID id,@Valid @RequestBody Create request){return swaps.create(auth.getName(),id,request.recipientEntryId());}
    @PostMapping("/{swapId}/accept") public QueueSwapService.SwapView accept(Authentication auth,@PathVariable UUID id,@PathVariable UUID swapId){return swaps.respond(auth.getName(),id,swapId,"accept");}
    @PostMapping("/{swapId}/reject") public QueueSwapService.SwapView reject(Authentication auth,@PathVariable UUID id,@PathVariable UUID swapId){return swaps.respond(auth.getName(),id,swapId,"reject");}
    @PostMapping("/{swapId}/cancel") public QueueSwapService.SwapView cancel(Authentication auth,@PathVariable UUID id,@PathVariable UUID swapId){return swaps.respond(auth.getName(),id,swapId,"cancel");}
}
