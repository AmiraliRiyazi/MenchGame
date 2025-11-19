using Microsoft.AspNetCore.Mvc;

namespace MenchGame.Controllers
{
    public class GameController : Controller
    {
        public IActionResult Index()
        {
            return View();
        }
    }
}