using Microsoft.AspNetCore.Mvc;

public class GameController : Controller
{
    private static GameState _state = new GameState();

    public IActionResult Index()
    {
        return View(_state);
    }

    [HttpPost]
    public IActionResult RollDice()
    {
        int dice = _state.DiceRoll();
        return Json(new { dice });
    }

    [HttpPost]
    public IActionResult Move(int pieceId, string color, int dice)
    {
        if (color == "red")
            _state.MovePiece(_state.RedPieces, pieceId, dice);
        else
            _state.MovePiece(_state.BluePieces, pieceId, dice);

        return Json(new { ok = true });
    }
}
