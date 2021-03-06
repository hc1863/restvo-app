import {Component, Input, OnDestroy, OnInit, ViewChild} from '@angular/core';
import {
  Events,
  IonInfiniteScroll,
  ModalController,
  Platform,
} from "@ionic/angular";
import {Location} from "@angular/common";
import {Storage} from "@ionic/storage";
import {Auth} from "../../../services/auth.service";
import {Chat} from "../../../services/chat.service";
import {UserData} from "../../../services/user.service";
import {Moment} from "../../../services/moment.service";
import {Resource} from "../../../services/resource.service";
import {ShowfeaturePage} from "../../feature/showfeature/showfeature.page";
import {ActivatedRoute, Router} from "@angular/router";
import {PickfeaturePopoverPage} from "../../feature/pickfeature-popover/pickfeature-popover.page";

@Component({
  selector: 'app-preferences',
  templateUrl: './preferences.page.html',
  styleUrls: ['./preferences.page.scss'],
})
export class PreferencesPage implements OnInit, OnDestroy {
  @ViewChild(IonInfiniteScroll) infiniteScroll: IonInfiniteScroll;

  @Input() modalPage: any;
  @Input() showHeader: any;
  @Input() programId: any; // the program ID
  @Input() type: number; // 2: participants, 3: organizers, 4: leaders
  @Input() organizer = false;

  subscriptions: any = {};
  moments = [];
  ionSpinner = false;
  pageNum: number = 0;
  reachedEnd: boolean = false;
  conversation: any;
  members: any = [];
  searchKeyword = '';
  refreshNeeded = false;

  constructor(
      private route: ActivatedRoute,
      private router: Router,
      private events: Events,
      private location: Location,
      private storage: Storage,
      private platform: Platform,
      private authService: Auth,
      private chatService: Chat,
      public userData: UserData,
      public momentService: Moment,
      private resourceService: Resource,
      private modalCtrl: ModalController) {}

  ngOnInit() {
      // link the refreshUserStatus Observable with the refresh handler. It fires on page load and subsequent user refreshes
      this.subscriptions['refreshUserStatus'] = this.userData.refreshUserStatus$.subscribe(this.refreshUserStatusHandler);
  }

  refreshUserStatusHandler = () => {
    this.setup();
  };

  setup() {
    if (this.userData && this.userData.user) {
      this.programId = this.programId || this.route.snapshot.paramMap.get('programId'); // the program ID
      this.type = this.type || parseInt(this.route.snapshot.paramMap.get('type'), 10); // 2: participants, 3: organizers, 4: leaders
      this.showHeader = this.showHeader || (this.route.snapshot.paramMap.get('showHeader') === 'true'); // 2: participants, 3: organizers, 4: leaders
      this.organizer = this.organizer || JSON.parse(this.route.snapshot.paramMap.get('organizer'));
      this.loadPreferences();
    } else {
      this.router.navigateByUrl('/app/discover');
    }
  }

  // load Program onboarding activities

  async loadPreferences() {
    setTimeout(async () => {
      this.ionSpinner = true;
      this.infiniteScroll.disabled = false;
      this.reachedEnd = false;
      this.moments = [];
      this.pageNum = 0;
      this.loadMorePreferences({target: this.infiniteScroll});
    }, 50);
  }

  async loadMorePreferences(event) {
    this.pageNum++;
    if (!this.reachedEnd) {
      let processes: any;
      if (this.organizer) {
        processes = await this.momentService.loadProgramOnboardActivities(this.programId, null, false);
        this.reachedEnd = true;
      } else {
        processes = await this.momentService.loadUserPreferences(this.pageNum, this.programId, null);
      }
      this.ionSpinner = false;
      if (!processes.length) {
        this.reachedEnd = true;
        event.target.disabled = true;
      } else {
        for (const process of processes) {
          process.status = !process.response ? 'New' : (process.response.matrix_number.filter((c) => c.length > 5).length < process.resource.matrix_number[0].filter((c) => c === 40000 || c === 40020).length || process.response.matrix_string.filter((c) => c.length > 1 && c[1] && c[1].length > 0).length < process.resource.matrix_number[0].filter((c) => (c === 40010)).length) ? 'Incomplete' : 'Completed';
          this.moments.push(process);
        }
        if (!this.organizer) {
          // sort the list by program Name if it is showing all user's preferences
          this.moments.sort((a, b) => {
            if (a.program.matrix_string[0][0] < b.program.matrix_string[0][0]) { return -1; }
            if (a.program.matrix_string[0][0] > b.program.matrix_string[0][0]) { return 1; }
            return 0;
          });
        }
      }
      event.target.complete();
    } else {
      this.ionSpinner = false;
      event.target.complete();
    }
  }

  executeSearch(event) {
    event.stopPropagation();
    this.ionSpinner = true;
    this.loadPreferences();
  }

  async openOnboardingProcess(moment) {
    if (this.modalPage || this.platform.width() < 768) { // if regular user, show feature
      const modal = await this.modalCtrl.create({ component: ShowfeaturePage, componentProps: { moment: moment, modalPage: true } });
      await modal.present();
      const {data: refreshNeeded} = await modal.onDidDismiss();
      if (refreshNeeded) {
        this.setup();
      }
    } else {
      if (this.router.url.includes('app/user')) { // if opened from User -> About Me
        this.router.navigate(['/app/user/activity/' + moment._id], { replaceUrl: false });
      } else { // such case does not exist yet. User should always open from the User -> About Me
        this.router.navigate(['/app/activity/' + moment._id], { replaceUrl: false });
      }
    }
  }

    async chooseOnboardingProcess(event) {
      event.stopPropagation();
      const modal = await this.modalCtrl.create({component: PickfeaturePopoverPage, componentProps: {title: 'Choose from Library', categoryId: '5e17acd47b00ea76b75e5a71', programId: this.programId, type: this.type, allowCreate: true, allowSwitchCategory: false, modalPage: true }});
      await modal.present();
      const {data: moments} = await modal.onDidDismiss();
      if (moments && moments.length) {
          for (const moment of moments) {
            // prepare object for cloning. copy everything except calendar and add program and onboarding types
            moment.calendar = { // reset the calendar
              title: moment.matrix_string[0][0],
              location: '',
              notes: '',
              startDate: new Date().toISOString(),
              endDate: new Date().toISOString(),
              options: {
                firstReminderMinutes: 0,
                secondReminderMinutes: 0,
                reminders: []
              }
            };
            moment.program = this.programId;
            if (this.type && moment.array_boolean.length > this.type) {
              moment.array_boolean[this.type] = true;
            }
          }
          const clonedMoments: any = await this.momentService.clone(moments, null); // clone the array of selected activities from Picker
          for (const clonedMoment of clonedMoments) {
              const index = moments.map((moment) => moment.resource._id).indexOf(clonedMoment.resource);
              if (index > -1) {
                 clonedMoment.resource = moments[index].resource; // clone the populated resource
              }
          }
          this.moments.unshift(...clonedMoments);
      }
    }

  closeModal() {
    if (this.modalPage) {
      // because Preference page is started by EditMoment via event listener and not via modalCtrl (hence it can't return the refreshNeeded obj back to EditMoment), it is necessary to publish a 'RefreshUserStatus' event to update EditMoment
      if (this.refreshNeeded) {
        this.userData.refreshUserStatus({});
      }
      this.modalCtrl.dismiss(this.refreshNeeded);
    } else {
      this.location.back();
    }
  }

  ngOnDestroy() {
    this.subscriptions['refreshUserStatus'].unsubscribe(this.refreshUserStatusHandler);
  }
}
