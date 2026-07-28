const locations = {
  union: {
    title: "Illini Union",
    image: "assets/illini-union.jpg",
    alt: "Illini Union location preview",
    description:
      "The Illini Union acts as the main check-in point. Most of our activities will be organized here."
  },
  quad: {
    title: "Main Quad",
    image: "assets/main-quad.jpg",
    alt: "Main Quad location preview",
    description:
      "The Main Quad setting connects the VR story to the everyday rhythm of UIUC life. It works well for a public-facing booth where students can encounter the project between classes."
  },
  hall: {
    title: "Residence Hall Lounge",
    image: "assets/residence-hall.jpg",
    alt: "Residence hall lounge location preview",
    description:
      "The residence hall setting emphasizes convenient attempt for students to experience our project. It is also useful for a quieter, more personal version of the experience."
  },
  classroom: {
    title: "Classroom Studio",
    image: "assets/classroom.jpg",
    alt: "Classroom studio location preview",
    description:
      "The classroom studio setting supports discussion, reflection, and writing after the VR experience."
  }
};

const state = {
  date: "Apr 18",
  time: "10:00 AM",
  location: "union"
};

const locationImage = document.querySelector("#locationImage");
const locationTitle = document.querySelector("#locationTitle");
const locationDescription = document.querySelector("#locationDescription");
const bookingLocation = document.querySelector("#bookingLocation");
const bookingLocationImage = document.querySelector("#bookingLocationImage");
const bookingLocationName = document.querySelector("#bookingLocationName");
const confirmation = document.querySelector("#confirmation");

function updateLocation(locationKey) {
  const item = locations[locationKey];
  if (!item) return;

  state.location = locationKey;

  if (locationImage) {
    locationImage.src = item.image;
    locationImage.alt = item.alt;
  }

  if (locationTitle) locationTitle.textContent = item.title;
  if (locationDescription) locationDescription.textContent = item.description;

  if (bookingLocation) bookingLocation.value = locationKey;

  if (bookingLocationImage) {
    bookingLocationImage.src = item.image;
    bookingLocationImage.alt = item.alt;
  }

  if (bookingLocationName) bookingLocationName.textContent = item.title;

  document.querySelectorAll(".location-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.location === locationKey);
  });
}

document.querySelectorAll(".location-btn").forEach((button) => {
  button.addEventListener("click", () => {
    updateLocation(button.dataset.location);
  });
});

if (bookingLocation) {
  bookingLocation.addEventListener("change", (event) => {
    updateLocation(event.target.value);
  });
}

document.querySelectorAll(".calendar button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".calendar button").forEach((btn) => btn.classList.remove("selected"));
    button.classList.add("selected");
    state.date = button.dataset.date;
  });
});

document.querySelectorAll(".time-list button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".time-list button").forEach((btn) => btn.classList.remove("selected"));
    button.classList.add("selected");
    state.time = button.dataset.time;
  });
});

const form = document.querySelector("#bookingForm");
if (form) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const reservation = {
      name: formData.get("name"),
      email: formData.get("email"),
      studentId: formData.get("studentId") || "Not provided",
      date: state.date,
      time: state.time,
      location: locations[state.location].title
    };

    localStorage.setItem("nostalgiaVrReservation", JSON.stringify(reservation));

    confirmation.hidden = false;
    confirmation.innerHTML = `
      Reservation saved for <strong>${reservation.name}</strong>:
      ${reservation.date}, ${reservation.time}, at ${reservation.location}.
      A real version would send a confirmation email; this prototype saves the information locally for the assignment demo.
    `;

    confirmation.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

updateLocation("union");
