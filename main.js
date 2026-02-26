const git = document.getElementById("Git")
git.addEventListener("click", () =>{
    window.open("https://github.com/jady17500")
})

const linkedin = document.getElementById("Linkedin")
linkedin.addEventListener("click", () =>{
    window.open("https://www.linkedin.com/in/marco-piamonte-b78502247/")
})

const itch = document.getElementById("Itch")
itch.addEventListener("click", () =>{
    window.open("https://jady1750.itch.io/")
})

const hamburger = document.querySelector(".hamburger")
const navLinks = document.querySelector(".nav-links")
const btns = document.querySelector(".btns")

hamburger.addEventListener("click", () => {
    navLinks.classList.toggle("nav-open")
    btns.classList.toggle("nav-open")
    hamburger.classList.toggle("active")
})

navLinks.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
        navLinks.classList.remove("nav-open")
        btns.classList.remove("nav-open")
        hamburger.classList.remove("active")
    })
})

const FormSubmit = document.getElementById("submit")
if (FormSubmit) {
    const Subject = document.getElementById("fsubject")
    const Message = document.getElementById("fmessage")
    FormSubmit.addEventListener("click", () =>{
        window.open(`mailto:marco.piamonte04@gmail.com?subject=${Subject.value}&body=${Message.value}`);
    })
}