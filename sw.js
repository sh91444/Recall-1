const CACHE_NAME =
    "recall-v6";


const FILES_TO_CACHE = [

    "./",

    "./index.html",

    "./recall.css",

    "./recall.js",

    "./manifest.json",

    "./icons/icon.svg",

    "./icons/icon-192.png",

    "./icons/icon-512.png"

];



/* INSTALL */

self.addEventListener(
    "install",
    event => {

        event.waitUntil(

            caches
                .open(
                    CACHE_NAME
                )
                .then(cache => {

                    return cache
                        .addAll(
                            FILES_TO_CACHE
                        );

                })

        );


        self.skipWaiting();

    }
);



/* ACTIVATE */

self.addEventListener(
    "activate",
    event => {

        event.waitUntil(

            caches
                .keys()
                .then(names => {

                    return Promise.all(

                        names.map(
                            name => {

                                if (
                                    name !==
                                    CACHE_NAME
                                ) {

                                    return caches
                                        .delete(
                                            name
                                        );

                                }

                            }
                        )

                    );

                })

        );


        self.clients.claim();

    }
);



/* FETCH */

self.addEventListener(
    "fetch",
    event => {

        if (
            event.request.method !==
            "GET"
        ) {

            return;

        }


        event.respondWith(

            fetch(
                event.request
            )
                .then(response => {

                    const copy =
                        response.clone();


                    caches
                        .open(
                            CACHE_NAME
                        )
                        .then(cache => {

                            cache.put(
                                event.request,
                                copy
                            );

                        });


                    return response;

                })
                .catch(() => {

                    return caches
                        .match(
                            event.request
                        )
                        .then(cached => {

                            return (
                                cached ||
                                caches.match(
                                    "./index.html"
                                )
                            );

                        });

                })

        );

    }
);
