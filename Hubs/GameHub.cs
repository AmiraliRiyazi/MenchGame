using Microsoft.AspNetCore.SignalR;

public class GameHub : Hub
{
    public async Task MovePiece(int playerId, int pieceId, int newPosition)
    {
        await Clients.Others.SendAsync("PieceMoved", playerId, pieceId, newPosition);
    }
}
